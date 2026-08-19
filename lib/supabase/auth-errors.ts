const KNOWN_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password',
  'Email not confirmed': 'Your email isn’t confirmed yet — check your inbox',
  'User already registered': 'An account with this email already exists',
  'Password should be at least 6 characters': 'Password must be at least 6 characters',
  'Unable to validate email address: invalid format': 'That email address doesn’t look right',
  'Signup requires a valid password': 'Enter a password',
  'For security purposes, you can only request this after some time.':
    'Too many attempts — please wait a moment and try again',
}

export function translateAuthError(message: string): string {
  if (KNOWN_ERRORS[message]) return KNOWN_ERRORS[message]
  if (/invalid/i.test(message) && /email/i.test(message)) return 'That email address doesn’t look right'
  return 'Something went wrong, please try again'
}
