const KNOWN_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Неверный email или пароль',
  'Email not confirmed': 'Email ещё не подтверждён — проверьте почту',
  'User already registered': 'Пользователь с таким email уже зарегистрирован',
  'Password should be at least 6 characters': 'Пароль должен быть не короче 6 символов',
  'Unable to validate email address: invalid format': 'Некорректный формат email',
  'Signup requires a valid password': 'Введите пароль',
  'For security purposes, you can only request this after some time.':
    'Слишком много попыток подряд — подождите немного и попробуйте снова',
}

export function translateAuthError(message: string): string {
  if (KNOWN_ERRORS[message]) return KNOWN_ERRORS[message]
  if (/invalid/i.test(message) && /email/i.test(message)) return 'Некорректный email'
  return 'Что-то пошло не так, попробуйте снова'
}
