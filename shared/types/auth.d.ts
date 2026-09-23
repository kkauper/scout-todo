declare module '#auth-utils' {
  interface User {
    id: string
    name: string
  }

  interface SecureSessionData {
    sv: number
  }
}

export {}
