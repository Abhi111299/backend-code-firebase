const express = require('express');
const bodyParser = require('body-parser');
const firebaseAdmin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const cors = require('cors');
const app = express();
const bcrypt = require('bcryptjs');
const port = 4000;

console.log('Service Account Project ID+++++++++++++++++++:', serviceAccount.project_id);
// Initialize Firebase Admin SDK with service account
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount)
});

const auth = firebaseAdmin.auth();
const db = firebaseAdmin.firestore();

// Middleware
app.use(bodyParser.json());
app.use(cors());

async function checkFirestoreConnection() {
  try {
    // Attempt to fetch a document from a test collection or use any simple query
    const testDoc = await db.collection('user').doc('connection_check').get();
    
    if (testDoc.exists) {
      console.log('Firestore is connected!');
    } else {
      console.log('Firestore is connected, but the user document doesn’t exist.');
    }
  } catch (error) {
    console.error('Error connecting to Firestore:', error);
  }
}

// Check Firestore connection
checkFirestoreConnection();


// User Registration API
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Create a new user with Firebase Authentication
    const userRecord = await auth.createUser({
      email,
      password,
    });

    const hashedPassword = await bcrypt.hash(password, 10);  // 10 is the salt rounds


    // Save user info in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: userRecord.email,
      password: hashedPassword,
      status: 'offline',  // The user starts as 'offline'
      notifications: 0,   // Default notification count
      createdAt: new Date().toISOString(),  // Store creation date
    });

    res.status(201).send({ message: 'User registered successfully!', userRecord });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(400).send({ message: error.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      return res.status(404).send({ message: 'No users found' });
    }

    const users = [];
    usersSnapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send({ message: 'Error fetching users' });
  }
});

// User Login API
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Get user from Firebase Authentication using firebaseAdmin
    const user = await firebaseAdmin.auth().getUserByEmail(email);  // Use firebaseAdmin.auth()

    // Fetch user's hashed password from Firestore or your database
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).send({ message: 'User not found' });
    }

    // Retrieve stored hashed password
    const storedHashedPassword = userDoc.data().password;

    // Compare entered password with stored hash
    const isMatch = await bcrypt.compare(password, storedHashedPassword);

    if (!isMatch) {
      return res.status(401).send({ message: 'Invalid login details' });
    }

    // If credentials are correct, create a custom token
    const customToken = await firebaseAdmin.auth().createCustomToken(user.uid);  // Use firebaseAdmin.auth()

    // Send the custom token to the client
    res.status(200).send({ message: 'Login successful!', token: customToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(400).send({ message: error.message });
  }
});


// User Logout API (to set status to offline)
app.post('/logout', async (req, res) => {
  const { uid } = req.body;
  try {
    await db.collection('users').doc(uid).update({
      status: 'offline',
    });

    res.status(200).send({ message: 'User logged out and status updated to offline' });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Send Message API
app.post('/send-message', async (req, res) => {
  const { senderUid, receiverUid, message } = req.body;

  try {
    // Add message to Firestore
    await db.collection('messages').add({
      senderUid,
      receiverUid,
      message,
      timestamp: new Date().toISOString(),
    });

    // Get receiver FCM token
    const receiverDoc = await db.collection('users').doc(receiverUid).get();
    const receiverData = receiverDoc.data();
    console.log("Receiver Token==========>",receiverData);

    if (receiverData && receiverData.fcmToken) {
      // Send notification via FCM
      const messagePayload = {
        notification: {
          title: 'New Message',
          body: message,
        },
        token: receiverData.fcmToken,  // FCM token of the receiver
      };

      // Send notification
      await admin.messaging().send(messagePayload);
    }

    // Increment notification count for receiver
    if (receiverData) {
      await db.collection('users').doc(receiverUid).update({
        notifications: receiverData.notifications + 1,
      });
    }

    res.status(200).send({ message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(400).send({ message: error.message });
  }
});


// Get Messages API (to fetch chat messages between two users)
app.get('/get-messages', async (req, res) => {
  const { user1Uid, user2Uid } = req.query;
  if (!user1Uid || !user2Uid) {
    return res.status(400).json({ error: "Missing required parameters" });
  }
  try {
    // Fetch chat messages between user1 and user2
    const messagesSnapshot = await db
      .collection('messages')
      .where('senderUid', 'in', [user1Uid, user2Uid])
      .where('receiverUid', 'in', [user1Uid, user2Uid])
      .orderBy('timestamp', 'asc')
      .get();
      // console.log("messagesSnapshot===>",messagesSnapshot);

    const messages = messagesSnapshot.docs.map(doc => doc.data());

    res.status(200).send({ messages });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// Listen on the port
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
