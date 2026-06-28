import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCARaLFSdJgYalZ5G7pjuWzGXtSLJ4jVsY",
  authDomain: "login-and-sign-up-set-up.firebaseapp.com",
  projectId: "login-and-sign-up-set-up",
  storageBucket: "login-and-sign-up-set-up.firebasestorage.app",
  messagingSenderId: "435462997201",
  appId: "1:435462997201:web:595adbdd6f2a328e0e31f0",
  measurementId: "G-3VDG4E5YQ8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider };
