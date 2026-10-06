// Stand-in for firebase/app: nothing to start.
export interface FirebaseApp {
  name: string
}
export function initializeApp(): FirebaseApp {
  return { name: 'fake' }
}
