import { signInWithPopup, signOut } from "firebase/auth";
import { auth, provider } from "../firebaseConfig";

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}
