const admin = require('firebase-admin');

// Initialize Firebase Admin SDK with service account and specify the storage bucket correctly
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://chat-website-be22c-default-rtdb.firebaseio.com/',  // Realtime Database URL
  // storageBucket: 'chat-website-be22c.appspot.com',  // Correct storage bucket format
});

// Initialize Firestore and Storage references
const db = admin.firestore();
const storage = admin.storage().bucket();  // Firebase Storage reference
console.log('Storage Bucket:', storage.name);
module.exports = { db, storage };
