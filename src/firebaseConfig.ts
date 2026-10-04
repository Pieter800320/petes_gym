/*
 * Firebase web config for the Pete's Gym project.
 * These values are not secret — Firebase web configs are public by design. Access is
 * protected by the Firestore security rules in firestore.rules (only Pieter's account can
 * read and write, and only its own users/{uid} tree).
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDmy2SFI2Gp1oxW0CaFbCNVB41jZS8hkIY',
  authDomain: 'petes-gym.firebaseapp.com',
  projectId: 'petes-gym',
  storageBucket: 'petes-gym.firebasestorage.app',
  messagingSenderId: '106912850411',
  appId: '1:106912850411:web:d6eda487119b981bc8b9ae',
}

/**
 * The one Google account the app is for, in lower case (public anyway: the privacy notice names it).
 * Anyone else who signs in is shown "No access". That is only a courtesy: the rules keep them out.
 */
export const OWNER_EMAIL = 'vandermerwe.pieter6@gmail.com'
