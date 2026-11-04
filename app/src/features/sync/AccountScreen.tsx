// Settings › Sync my cards (roadmap 6.1): signing in with Google, Apple or an emailed code, and
// signing out. Signing in is optional; Recap works the same without it.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { showSnackbar } from '@/components/Snackbar';
import { showAlert } from '@/lib/alert';
import { language, t } from '@/lib/i18n';
import { isWeb } from '@/lib/platform';
import { AccountError, type Account } from '@/lib/sync/account';
import { radius, touchTarget, useColors, useStyles, type Colors } from '@/lib/theme';

import { accountClient } from './api';
import { signInWithApple } from './apple';
import { finishBrowserSignIn, signInInBrowser } from './browser';
import { AppleLogo, GoogleLogo } from './Logos';
import { setAccount, signedInWith, useAccount } from './session';

type Way = 'google' | 'apple' | 'email';
type EmailStep = 'closed' | 'address' | 'code';

const messageOf = (e: unknown) =>
  e instanceof AccountError ? e.message : t('accountError.failed');

export default function AccountScreen() {
  const styles = useStyles(makeStyles);
  const account = useAccount();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [working, setWorking] = useState<Way | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (way: Way, task: () => Promise<Account | null>) => {
    setProblem(null);
    setWorking(way);
    try {
      done(await task());
    } catch (e) {
      console.warn('Sign-in failed', e);
      setProblem(messageOf(e));
    } finally {
      setWorking(null);
    }
  };

  // The website comes back here from Google or Apple, with ?code= or ?error= (browser.web.ts),
  // and is signing in until the address is plain /account again.
  const { code, error } = params;
  const returning = Boolean(code || error);
  useEffect(() => {
    if (!code && !error) return;
    finishBrowserSignIn({ code, error })
      .then(done)
      .catch((e: unknown) => {
        console.warn('Sign-in failed', e);
        setProblem(messageOf(e));
      })
      // Off the address, so a reload doesn't try the used code again; the screen stays.
      .finally(() => router.setParams({ code: undefined, error: undefined }));
  }, [code, error]);

  const confirmSignOut = () =>
    showAlert(
      t('account.signOutTitle'),
      t(isWeb ? 'account.signOutBodyWeb' : 'account.signOutBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('account.signOut'), style: 'destructive', onPress: () => setAccount(null) },
      ],
    );

  // Opened straight from an address (the website after signing in) there's nothing to go back to.
  const header = router.canGoBack() ? null : (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Button variant="text" label={t('screen.home')} onPress={() => router.replace('/')} />
        ),
      }}
    />
  );

  if (account) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        <Text accessibilityRole="header" style={styles.title}>
          {signedInWith(account)}
        </Text>
        {account.email ? <Text style={styles.body}>{account.email}</Text> : null}
        <Text style={styles.description}>{t('account.signedInBody')}</Text>
        <Button variant="secondary" label={t('account.signOut')} onPress={confirmSignOut} />
      </ScrollView>
    );
  }

  const busy = working !== null || returning;
  const google = (
    <ProviderButton
      key="google"
      provider="google"
      disabled={busy}
      onPress={() => run('google', () => signInInBrowser('google'))}
    />
  );
  const apple = (
    <ProviderButton
      key="apple"
      provider="apple"
      disabled={busy}
      onPress={() => run('apple', signInWithApple)}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {header}
      <Text style={styles.body}>{t(isWeb ? 'account.introWeb' : 'account.intro')}</Text>
      {/* Apple first on iPhones, Google first elsewhere. */}
      {Platform.OS === 'ios' ? [apple, google] : [google, apple]}
      <EmailSignIn busy={busy} onError={setProblem} run={(task) => run('email', task)} />
      {busy ? (
        <Text style={styles.description} accessibilityLiveRegion="polite">
          {t('account.signingIn')}
        </Text>
      ) : null}
      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function done(signedIn: Account | null) {
  if (!signedIn) return;
  setAccount(signedIn);
  showSnackbar(t('account.signedInSnack'));
}

function ProviderButton({
  provider,
  disabled,
  onPress,
}: {
  provider: 'google' | 'apple';
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const isGoogle = provider === 'google';
  const label = t(isGoogle ? 'account.google' : 'account.apple');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.provider,
        isGoogle ? styles.google : styles.apple,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {isGoogle ? <GoogleLogo /> : <AppleLogo color={colors.appleButtonText} />}
      <Text style={[styles.providerLabel, isGoogle ? styles.googleLabel : styles.appleLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "Continue with email": the address, then the 6-digit code it was sent. */
function EmailSignIn({
  busy,
  onError,
  run,
}: {
  busy: boolean;
  onError: (message: string | null) => void;
  run: (task: () => Promise<Account | null>) => Promise<void>;
}) {
  const styles = useStyles(makeStyles);
  const colors = useColors();
  const [step, setStep] = useState<EmailStep>('closed');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  const sendCode = async () => {
    const address = email.trim();
    if (!address) return;
    onError(null);
    setSending(true);
    try {
      await accountClient.sendCode(address, language());
      setCode('');
      setStep('code');
    } catch (e) {
      console.warn('Could not send the code', e);
      onError(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  const signIn = (typed = code) => {
    if (typed.length !== 6) return;
    return run(() => accountClient.emailSignIn(email.trim(), typed));
  };

  if (step === 'closed') {
    return (
      <Button
        variant="secondary"
        label={t('account.email')}
        disabled={busy}
        onPress={() => setStep('address')}
      />
    );
  }

  const locked = busy || sending;
  if (step === 'address') {
    return (
      <View style={styles.email}>
        <Text style={styles.label}>{t('account.emailLabel')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('account.emailPlaceholder')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('account.emailLabel')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={sendCode}
          autoFocus
          editable={!locked}
          style={styles.input}
        />
        <Button
          label={t('account.sendCode')}
          disabled={locked || !email.trim()}
          onPress={sendCode}
        />
      </View>
    );
  }

  return (
    <View style={styles.email}>
      <Text style={styles.body}>{t('account.codeSent', { email: email.trim() })}</Text>
      <Text style={styles.label}>{t('account.codeLabel')}</Text>
      <TextInput
        value={code}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) signIn(digits);
        }}
        accessibilityLabel={t('account.codeLabel')}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={() => signIn()}
        autoFocus
        editable={!locked}
        style={[styles.input, styles.code]}
      />
      <Button
        label={t('account.signIn')}
        disabled={locked || code.length !== 6}
        onPress={() => signIn()}
      />
      <View style={styles.row}>
        <Button variant="text" label={t('account.newCode')} disabled={locked} onPress={sendCode} />
        <Button
          variant="text"
          label={t('account.otherEmail')}
          disabled={locked}
          onPress={() => {
            onError(null);
            setStep('address');
          }}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 48, gap: 12 },
    title: { fontSize: 20, fontWeight: '600', color: colors.text },
    body: { fontSize: 16, color: colors.text, lineHeight: 22 },
    description: { fontSize: 14, color: colors.muted },
    label: { fontSize: 16, color: colors.text, fontWeight: '500' },
    problem: { fontSize: 15, color: colors.danger },
    provider: {
      minHeight: touchTarget,
      borderRadius: radius.button,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    google: {
      backgroundColor: colors.googleButton,
      borderWidth: 1,
      borderColor: colors.googleButtonBorder,
    },
    apple: { backgroundColor: colors.appleButton },
    providerLabel: { fontSize: 16, fontWeight: '600' },
    googleLabel: { color: colors.googleButtonText },
    appleLabel: { color: colors.appleButtonText },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.8 },
    email: { gap: 8 },
    input: {
      minHeight: touchTarget,
      borderRadius: radius.button,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      fontSize: 17,
      color: colors.text,
    },
    code: { letterSpacing: 6, fontSize: 20 },
    row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  });
