// Leaderboard › Join, or Edit (roadmap 6.8): the name others see, the username friends follow you
// by, Anonymous, the people you blocked, and leaving. Names go through the Worker's own filter
// (lib/leaderboard/names.ts) before they're sent, so most problems show without asking it.
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { SwitchRow } from '@/components/SwitchRow';
import { showAlert } from '@/lib/alert';
import { SUPPORT_URL } from '@/lib/contact';
import { t, type StringKey } from '@/lib/i18n';
import { BoardError, type Person, type Profile } from '@/lib/leaderboard/client';
import {
  cleanDisplayName,
  cleanUsername,
  DISPLAY_NAME_MAX,
  displayNameProblem,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameProblem,
  type NameProblem,
} from '@/lib/leaderboard/names';
import { radius, touchTarget, useColors, useStyles, type Colors } from '@/lib/theme';

import { boardClient } from './api';
import { hiddenNote, problemText } from './problem';
import { sendScore, startOver } from './score';

const RULES_URL = `${SUPPORT_URL}#leaderboard`;
/** Shown before joining (Apple 1.2: people agree to the rules for names others see). */
const RULES: StringKey[] = ['board.rule1', 'board.rule2', 'board.rule3'];

const NAME_TEXT: Record<NameProblem, StringKey> = {
  too_short: 'boardName.too_short',
  too_long: 'boardName.too_long',
  characters: 'boardName.characters',
  not_allowed: 'boardName.not_allowed',
};
const USERNAME_TEXT: Record<NameProblem, StringKey> = {
  too_short: 'boardUsername.too_short',
  too_long: 'boardUsername.too_long',
  characters: 'boardUsername.characters',
  not_allowed: 'boardName.not_allowed',
};
const LIMITS = { min: USERNAME_MIN, max: USERNAME_MAX, n: DISPLAY_NAME_MAX };

/** The Worker's "display_name_too_long" / "username_not_allowed" → which field, and why. */
function refusedName(code: string): { field: 'name' | 'username'; problem: NameProblem } | null {
  const match = /^(display_name|username)_(too_short|too_long|characters|not_allowed)$/.exec(code);
  if (!match) return null;
  return {
    field: match[1] === 'username' ? 'username' : 'name',
    problem: match[2] as NameProblem,
  };
}

export default function ProfileScreen() {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  // undefined: not known yet; null: joining.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [usernameProblem_, setUsernameProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    boardClient
      .me()
      .then((me) => {
        if (!live) return;
        setProfile(me);
        if (!me) return;
        setDisplayName(me.displayName);
        setUsername(me.username);
        setAnonymous(me.anonymous);
      })
      .catch((e: unknown) => {
        console.warn('Leaderboard', e);
        if (live) setProblem(problemText(e));
      });
    return () => {
      live = false;
    };
  }, []);

  const save = async () => {
    const name = cleanDisplayName(displayName);
    const user = cleanUsername(username.replace(/^@/, ''));
    const badName = displayNameProblem(name);
    const badUser = usernameProblem(user);
    setNameProblem(badName ? t(NAME_TEXT[badName], LIMITS) : null);
    setUsernameProblem(badUser ? t(USERNAME_TEXT[badUser], LIMITS) : null);
    setProblem(null);
    if (badName || badUser) return;
    setBusy(true);
    try {
      await boardClient.save({ displayName: name, username: user, anonymous });
      if (!profile) {
        // On the board with no score yet: this device's goes now.
        startOver(true);
        void sendScore(true);
      }
      showSnackbar(t(profile ? 'board.saved' : 'board.joined'));
      router.back();
    } catch (e) {
      console.warn('Leaderboard', e);
      const refused = e instanceof BoardError ? refusedName(e.code) : null;
      if (refused?.field === 'name') setNameProblem(t(NAME_TEXT[refused.problem], LIMITS));
      else if (refused) setUsernameProblem(t(USERNAME_TEXT[refused.problem], LIMITS));
      else if (e instanceof BoardError && e.kind === 'taken') {
        setUsernameProblem(t('boardError.taken'));
      } else setProblem(problemText(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    showAlert(t('board.leaveTitle'), t('board.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('board.leave'),
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          boardClient
            .leave()
            .then(() => {
              startOver(false);
              showSnackbar(t('board.left'));
              router.back();
            })
            .catch((e: unknown) => {
              console.warn('Leaderboard', e);
              setProblem(problemText(e));
            })
            .finally(() => setBusy(false));
        },
      },
    ]);

  const title = (
    <Stack.Screen
      options={{ title: t(profile === null ? 'screen.boardJoin' : 'screen.boardProfile') }}
    />
  );

  if (profile === undefined) {
    return (
      <View style={styles.content}>
        {title}
        <Text
          style={problem ? styles.problem : styles.description}
          accessibilityLiveRegion="polite"
        >
          {problem ?? t('board.loading')}
        </Text>
      </View>
    );
  }

  const note = profile ? hiddenNote(profile) : null;
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {title}
      {note ? <Text style={styles.problem}>{note}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('board.displayName')}</Text>
        <TextInput
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            setNameProblem(null);
          }}
          placeholder={t('board.displayNamePlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('board.displayName')}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={DISPLAY_NAME_MAX + 10}
          editable={!busy}
          style={styles.input}
        />
        {nameProblem ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite">
            {nameProblem}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('board.username')}</Text>
        <TextInput
          value={username}
          onChangeText={(text) => {
            setUsername(text.toLowerCase());
            setUsernameProblem(null);
          }}
          placeholder={t('board.usernamePlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('board.username')}
          accessibilityHint={t('board.usernameHelp')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={USERNAME_MAX + 1}
          editable={!busy}
          style={styles.input}
        />
        <Text style={styles.description}>{t('board.usernameHelp')}</Text>
        {usernameProblem_ ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite">
            {usernameProblem_}
          </Text>
        ) : null}
      </View>

      <SwitchRow
        label={t('board.anonymousLabel')}
        description={t('board.anonymousHelp')}
        value={anonymous}
        onChange={setAnonymous}
      />

      <Text style={styles.description}>{t('board.whatOthersSee')}</Text>
      {profile ? (
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(RULES_URL).catch(() => showAlert(t('board.rulesLink'), RULES_URL))
          }
          style={styles.link}
        >
          <Text style={styles.description}>
            {t('board.rules')} <Text style={styles.linkText}>{t('board.rulesLink')}</Text>
          </Text>
        </Pressable>
      ) : (
        // Joining: the rules first, and "Agree and join" is agreeing to them.
        <View style={styles.rules}>
          <Text accessibilityRole="header" style={styles.rulesTitle}>
            {t('board.rulesLink')}
          </Text>
          {RULES.map((rule) => (
            <View key={rule} style={styles.rule}>
              <Text style={styles.bullet} importantForAccessibility="no">
                •
              </Text>
              <Text style={styles.ruleText}>{t(rule)}</Text>
            </View>
          ))}
        </View>
      )}

      <Button
        label={t(profile ? 'common.save' : 'board.agreeAndJoin')}
        disabled={busy}
        onPress={() => void save()}
      />
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}

      {profile ? (
        <>
          <Blocked />
          <Button variant="danger" label={t('board.leave')} disabled={busy} onPress={leave} />
        </>
      ) : null}
    </ScrollView>
  );
}

/** The people I blocked, each with Unblock. */
function Blocked() {
  const styles = useStyles(makeStyles);
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    let live = true;
    boardClient
      .blocked()
      .then((list) => live && setPeople(list))
      .catch((e: unknown) => console.warn('Leaderboard', e));
    return () => {
      live = false;
    };
  }, []);

  const unblock = (person: Person) =>
    boardClient
      .unblock(person.id)
      .then(() => {
        setPeople((list) => list?.filter((p) => p.id !== person.id) ?? null);
        showSnackbar(t('board.unblocked'));
      })
      .catch((e: unknown) => showAlert(problemText(e)));

  if (!people?.length) return null;
  return (
    <View style={styles.blocked}>
      <Text accessibilityRole="header" style={styles.heading}>
        {t('board.blockedPeople')}
      </Text>
      {people.map((person) => {
        const name = person.displayName ?? t('board.anonymous');
        return (
          <View key={person.id} style={styles.blockedRow}>
            <View style={styles.who}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {person.username ? (
                <Text style={styles.description} numberOfLines={1}>
                  @{person.username}
                </Text>
              ) : null}
            </View>
            <Button
              variant="secondary"
              label={t('board.unblock')}
              accessibilityLabel={t('board.unblockA11y', { name })}
              onPress={() => void unblock(person)}
            />
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 48, gap: 16 },
    field: { gap: 6 },
    label: { fontSize: 16, color: colors.text, fontWeight: '500' },
    description: { fontSize: 14, color: colors.muted },
    problem: { fontSize: 15, color: colors.danger },
    input: {
      minHeight: touchTarget,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      fontSize: 17,
      color: colors.text,
    },
    link: { minHeight: touchTarget, justifyContent: 'center' },
    rules: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 8 },
    rulesTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    rule: { flexDirection: 'row', gap: 8 },
    bullet: { fontSize: 15, color: colors.muted, lineHeight: 21 },
    ruleText: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 21 },
    linkText: { color: colors.primary, textDecorationLine: 'underline' },
    heading: { fontSize: 17, fontWeight: '600', color: colors.text, marginTop: 8 },
    blocked: { gap: 8 },
    blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    who: { flex: 1 },
    name: { fontSize: 16, fontWeight: '500', color: colors.text },
  });
