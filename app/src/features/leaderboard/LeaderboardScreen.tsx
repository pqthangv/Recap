// Statistics › Leaderboard (roadmap 6.8): streaks and this week's cards, for everyone or for the
// people you follow. Optional: it needs an account (Sync my cards) and joining (ProfileScreen).
// Tapping a row: follow or unfollow, block, or report the name; your own row changes your name.
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ActionSheet, type SheetOption } from '@/components/ActionSheet';
import { Button } from '@/components/Button';
import { FlameIcon } from '@/components/FlameIcon';
import { RankBadge } from '@/components/RankBadge';
import { showSnackbar } from '@/components/Snackbar';
import { useAccount } from '@/features/sync/session';
import { showAlert } from '@/lib/alert';
import { t, tn, type StringKey } from '@/lib/i18n';
import type { Profile, Ranking, Row, Tab, View as Board } from '@/lib/leaderboard/client';
import { cleanUsername } from '@/lib/leaderboard/names';
import { radius, touchTarget, useColors, useStyles, type Colors } from '@/lib/theme';

import { boardClient } from './api';
import { hiddenNote, problemText } from './problem';
import { noteJoined, sendScore } from './score';

/** "Only people with 50+ cards this week" on Everyone. */
const MIN_CARDS = 50;
const RANKINGS: Record<Ranking, StringKey> = { streak: 'board.byStreak', week: 'board.byWeek' };

export default function LeaderboardScreen() {
  const styles = useStyles(makeStyles);
  const account = useAccount();
  // undefined: not known yet; null: not on the board.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [board, setBoard] = useState<Board | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('everyone');
  const [by, setBy] = useState<Ranking>('streak');
  const [onlyActive, setOnlyActive] = useState(false);
  // Bumped to show the board again (pulling down, after following someone).
  const [reload, setReload] = useState(0);
  // Bumped each time the screen shows (also back from changing the name), and by Try again.
  const [visit, setVisit] = useState(0);
  const [opened, setOpened] = useState<Row | null>(null);
  const [choosingRank, setChoosingRank] = useState(false);

  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));

  // Who I am on the board, and my newest score there.
  useEffect(() => {
    if (!account || visit === 0) return;
    let live = true;
    boardClient
      .me()
      .then(async (me) => {
        if (!live) return;
        noteJoined(me !== null);
        setProfile(me);
        if (me) await sendScore(true);
        if (live) setReload((n) => n + 1);
      })
      .catch((e: unknown) => {
        console.warn('Leaderboard', e);
        if (live) setProblem(problemText(e));
      });
    return () => {
      live = false;
    };
  }, [account, visit]);

  const joined = Boolean(profile);
  const min = tab === 'everyone' && onlyActive ? MIN_CARDS : 0;
  // The board asked for, and the one last answered (or failed): loading until they match.
  const wanted = `${tab} ${by} ${min} ${reload}`;
  const [answered, setAnswered] = useState('');
  const loading = joined && reload > 0 && answered !== wanted;
  useEffect(() => {
    if (!joined || reload === 0) return;
    let live = true;
    boardClient
      .view(tab, by, min)
      .then((next) => {
        if (!live) return;
        setBoard(next);
        setProblem(null);
      })
      .catch((e: unknown) => {
        console.warn('Leaderboard', e);
        if (live) setProblem(problemText(e));
      })
      .finally(() => live && setAnswered(wanted));
    return () => {
      live = false;
    };
  }, [joined, reload, tab, by, min, wanted]);

  const refresh = () => void sendScore(true).then(() => setReload((n) => n + 1));

  if (!account) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('board.intro')}</Text>
        <Text style={styles.body}>{t('board.signInFirst')}</Text>
        <Button label={t('board.signIn')} onPress={() => router.push('/account')} />
      </ScrollView>
    );
  }

  if (profile === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.body}>{t('board.intro')}</Text>
        <Text style={styles.description}>{t('board.whatOthersSee')}</Text>
        <Button label={t('board.join')} onPress={() => router.push('/leaderboard/profile')} />
      </ScrollView>
    );
  }

  if (profile === undefined) {
    return (
      <View style={styles.content}>
        <Text
          style={problem ? styles.problem : styles.description}
          accessibilityLiveRegion="polite"
        >
          {problem ?? t('board.loading')}
        </Text>
        {problem ? (
          <Button
            variant="secondary"
            label={t('board.tryAgain')}
            onPress={() => {
              setProblem(null);
              setVisit((n) => n + 1);
            }}
          />
        ) : null}
      </View>
    );
  }

  const rows = board?.rows ?? [];
  const mineShown = rows.some((r) => r.me);
  const showRow = (row: Row) => (
    <BoardRow row={row} by={by} profile={profile} onPress={() => setOpened(row)} />
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              variant="text"
              label={t('common.edit')}
              accessibilityLabel={t('board.editA11y')}
              onPress={() => router.push('/leaderboard/profile')}
            />
          ),
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => showRow(item)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading && board !== null} onRefresh={refresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              items={[
                { key: 'everyone', label: 'board.everyone' },
                { key: 'friends', label: 'board.friends' },
              ]}
            />
            <View style={styles.pills}>
              <Pill
                label={t('board.sortLabel', { by: t(RANKINGS[by]) })}
                accessibilityLabel={t('board.sortA11y', { by: t(RANKINGS[by]) })}
                onPress={() => setChoosingRank(true)}
              />
              {tab === 'everyone' ? (
                <Pill
                  label={t('board.onlyActiveShort', { n: MIN_CARDS })}
                  accessibilityLabel={t('board.onlyActive', { n: MIN_CARDS })}
                  on={onlyActive}
                  onPress={() => setOnlyActive((on) => !on)}
                />
              ) : null}
            </View>
            {tab === 'friends' ? (
              <FollowByUsername onFollowed={() => setReload((n) => n + 1)} />
            ) : null}
            {profile.hidden || profile.anonymous ? (
              <Text style={styles.description}>
                {hiddenNote(profile) ?? t('board.youAnonymous')}
              </Text>
            ) : null}
            {problem ? (
              <Text style={styles.problem} accessibilityLiveRegion="polite">
                {problem}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          board ? null : <Text style={styles.description}>{loading ? t('board.loading') : ''}</Text>
        }
        ListFooterComponent={
          board ? (
            <View style={styles.footer}>
              {tab === 'friends' && rows.length <= 1 ? (
                <Text style={styles.description}>{t('board.noFriends')}</Text>
              ) : null}
              {!mineShown && board.me.rank !== null
                ? showRow({
                    id: profile.id,
                    rank: board.me.rank,
                    displayName: profile.displayName,
                    username: profile.username,
                    streak: board.me.streak,
                    weekCards: board.me.weekCards,
                    me: true,
                  })
                : null}
              {board.me.rank === null ? (
                <Text style={styles.description}>{t('board.notInList', { n: MIN_CARDS })}</Text>
              ) : null}
            </View>
          ) : null
        }
      />
      <RowSheet
        row={opened}
        onClose={() => setOpened(null)}
        onChanged={() => setReload((n) => n + 1)}
      />
      <ActionSheet
        visible={choosingRank}
        title={t('board.rankBy')}
        options={(['streak', 'week'] as const).map((key) => ({
          label: t(RANKINGS[key]),
          selected: by === key,
          onPress: () => setBy(key),
        }))}
        onClose={() => setChoosingRank(false)}
      />
    </>
  );
}

/** A pick-one row of tabs, e.g. Everyone | Friends. */
function Tabs<K extends string>({
  value,
  onChange,
  items,
}: {
  value: K;
  onChange: (key: K) => void;
  items: readonly { key: K; label: StringKey }[];
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === item.key }}
          onPress={() => onChange(item.key)}
          style={[styles.tab, value === item.key && styles.tabSelected]}
        >
          <Text style={[styles.tabText, value === item.key && styles.tabTextSelected]}>
            {t(item.label)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A small rounded button under the tabs: "Sort: Streak", or a filter that's violet when `on`. */
function Pill({
  label,
  accessibilityLabel,
  on,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  /** Set for a filter (an on/off switch to screen readers). */
  on?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      accessibilityRole={on === undefined ? 'button' : 'switch'}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={on === undefined ? undefined : { checked: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && styles.pressed]}
    >
      <Text
        style={[
          styles.pillText,
          on === undefined && styles.pillTextButton,
          on && styles.pillTextOn,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** "3  Lan · @lan   🔥 12 days" */
function BoardRow({
  row,
  by,
  profile,
  onPress,
}: {
  row: Row;
  by: Ranking;
  profile: Profile;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const name = row.displayName ?? t('board.anonymous');
  // Equal scores share a rank, so two people can share a medal; nobody gets one for nothing.
  const medal = (by === 'streak' ? row.streak : row.weekCards) > 0;
  const streak = tn('count.day', row.streak);
  const cards = tn('count.card', row.weekCards);
  const spoken = [
    t('board.rowA11y', { rank: row.rank, name, streak, cards }),
    row.me ? t('board.you') : null,
    row.me && (profile.anonymous || profile.hidden) ? t('board.anonymousToOthers') : null,
    row.following ? t('board.following') : null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={t('board.rowHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, row.me && styles.rowMine, pressed && styles.pressed]}
    >
      <View style={styles.rankCell}>
        <RankBadge rank={row.rank} medal={medal} />
      </View>
      <View style={styles.who}>
        <Text style={[styles.name, !row.displayName && styles.anonymous]} numberOfLines={1}>
          {name}
        </Text>
        {row.username || row.me || row.following ? (
          <Text style={styles.username} numberOfLines={1}>
            {[
              row.username ? `@${row.username}` : null,
              row.me ? t('board.you') : null,
              row.following ? t('board.following') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      {/* Both scores: the one it's sorted by on top, the other under it, like the @username. */}
      <View style={styles.scores}>
        {by === 'streak' ? (
          <>
            <StreakScore streak={row.streak} text={streak} />
            <Text style={[styles.otherScore, styles.otherLine]}>{cards}</Text>
          </>
        ) : (
          <>
            <Text style={styles.scoreText}>{cards}</Text>
            <StreakScore streak={row.streak} text={streak} small />
          </>
        )}
      </View>
    </Pressable>
  );
}

/** "🔥 12 days", bold, or `small` and grey under the cards. */
function StreakScore({
  streak,
  text,
  small = false,
}: {
  streak: number;
  text: string;
  small?: boolean;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.streak, small && styles.otherLine]}>
      <FlameIcon size={small ? 14 : 20} lit={streak > 0} />
      <Text style={small ? styles.otherScore : styles.scoreText}>{text}</Text>
    </View>
  );
}

/** Friends: follow someone by the username they chose. */
function FollowByUsername({ onFollowed }: { onFollowed: () => void }) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const follow = async () => {
    const name = cleanUsername(username.replace(/^@/, ''));
    if (!name) return;
    setBusy(true);
    setProblem(null);
    try {
      await boardClient.follow(name);
      setUsername('');
      showSnackbar(t('board.followed', { username: name }));
      onFollowed();
    } catch (e) {
      console.warn('Follow', e);
      setProblem(problemText(e, 'boardError.tooManyFollows'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.follow}>
      <View style={styles.followRow}>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder={t('board.usernamePlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('board.followByUsername')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={follow}
          editable={!busy}
          style={styles.input}
        />
        <Button label={t('board.follow')} disabled={busy || !username.trim()} onPress={follow} />
      </View>
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

/** What a tapped row can do. */
function RowSheet({
  row,
  onClose,
  onChanged,
}: {
  row: Row | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const act = async (task: () => Promise<void>, done: string, undo?: () => Promise<void>) => {
    try {
      await task();
      onChanged();
      showSnackbar(
        done,
        undo
          ? {
              label: t('common.undo'),
              onPress: () =>
                void undo()
                  .then(onChanged)
                  .catch((e: unknown) => showAlert(problemText(e))),
            }
          : undefined,
      );
    } catch (e) {
      console.warn('Leaderboard', e);
      showAlert(problemText(e, 'boardError.tooManyReports'));
    }
  };

  const options: SheetOption[] = [];
  if (row?.me) {
    options.push({
      label: t('board.changeName'),
      onPress: () => router.push('/leaderboard/profile'),
    });
  } else if (row) {
    const { id, username } = row;
    if (username && row.following) {
      options.push({
        label: t('board.unfollow'),
        onPress: () =>
          void act(
            () => boardClient.unfollow(id),
            t('board.unfollowed', { username }),
            () => boardClient.follow(username),
          ),
      });
    } else if (username) {
      options.push({
        label: t('board.follow'),
        onPress: () =>
          void act(() => boardClient.follow(username), t('board.followed', { username })),
      });
    }
    options.push({
      label: t('board.block'),
      onPress: () =>
        void act(
          () => boardClient.block(id),
          t('board.blocked'),
          () => boardClient.unblock(id),
        ),
    });
    // An anonymous row has no name to report.
    if (username) {
      options.push({
        label: t('board.report'),
        onPress: () =>
          showAlert(t('board.reportTitle'), t('board.reportBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('board.report'),
              style: 'destructive',
              onPress: () => void act(() => boardClient.report(id), t('board.reported')),
            },
          ]),
      });
    }
  }

  return (
    <ActionSheet
      visible={row !== null}
      title={row ? (row.displayName ?? t('board.anonymous')) : undefined}
      options={options}
      onClose={onClose}
    />
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, gap: 12 },
    list: { padding: 20, paddingTop: 12, paddingBottom: 48 },
    header: { gap: 12, marginBottom: 16 },
    footer: { gap: 12, marginTop: 8 },
    body: { fontSize: 16, color: colors.text, lineHeight: 22 },
    description: { fontSize: 14, color: colors.muted },
    problem: { fontSize: 15, color: colors.danger },
    tabs: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: radius.button,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      minHeight: touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.button - 4,
      paddingHorizontal: 4,
    },
    // The chosen tab in the same light violet as an "on" chip and your own row.
    tabSelected: { backgroundColor: colors.tint },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      minHeight: touchTarget,
      maxWidth: '100%',
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    pillOn: { backgroundColor: colors.tint, borderColor: colors.primary },
    pillText: { fontSize: 15, color: colors.text },
    pillTextButton: { fontWeight: '600' },
    pillTextOn: { fontWeight: '600', color: colors.primary },
    tabText: { fontSize: 15, color: colors.muted, textAlign: 'center' },
    tabTextSelected: { color: colors.primary, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: touchTarget + 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: -12,
      borderRadius: 12,
    },
    rowMine: { backgroundColor: colors.tint },
    pressed: { backgroundColor: colors.surface },
    // Every rank's badge in one centered column.
    rankCell: { minWidth: 40, alignItems: 'center' },
    who: { flex: 1 },
    name: { fontSize: 16, fontWeight: '500', color: colors.text },
    anonymous: { color: colors.muted, fontStyle: 'italic' },
    username: { fontSize: 13, color: colors.muted, marginTop: 2 },
    scores: { alignItems: 'flex-end' },
    streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    scoreText: { fontSize: 16, fontWeight: '600', color: colors.text },
    otherScore: { fontSize: 13, color: colors.muted },
    otherLine: { marginTop: 2 },
    follow: { gap: 8 },
    followRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    input: {
      flex: 1,
      minHeight: touchTarget,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      fontSize: 17,
      color: colors.text,
    },
  });
