// --- Конфигурация Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyAgpTriHrYvqSULJAwu4JfNijfi-n6L8iw",
  authDomain: "videocontet.firebaseapp.com",
  databaseURL: "https://videocontet-default-rtdb.firebaseio.com",
  projectId: "videocontet",
  storageBucket: "videocontet.firebasestorage.app",
  messagingSenderId: "944595625561",
  appId: "1:944595625561:web:e03787fee211fd15213348",
  measurementId: "G-QZJL8LR2DL"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let localStream = null;
const peers = {}; // все RTCPeerConnections по sessionId
const remoteVideosContainer = document.getElementById('remoteVideos');

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:wawqdfr1:3478',
      username: 'wawqdfr1',
      credential: 'lol123lol'
    }
  ]
};

const localVideo = document.getElementById('localVideo');
const statusDiv = document.getElementById('status');

let role = ''; // 'host' или 'participant'
let sessionId = '';
let participantId = '';

// Генератор случайного ID
function generateSessionId() {
  return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
}

document.getElementById('createBtn').onclick = async () => {
  sessionId = generateSessionId();
  document.getElementById('status').innerText = 'Создана сессия: ' + sessionId;
  role = 'host';
  await startLocalStream();
  await createSession();
};

document.getElementById('joinBtn').onclick = async () => {
  sessionId = document.getElementById('sessionIdInput').value.trim();
  if (!sessionId || sessionId.length !== 4 || isNaN(sessionId)) {
    alert('Введите корректный ID сессии (например 0001)');
    return;
  }
  role = 'participant';
  participantId = 'participant_' + generateSessionId();
  await startLocalStream();
  await joinSession();
};

// Запрос доступа к камере и отображение
async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert('Ошибка доступа к камере: ' + e);
  }
}

// Создание сессии (для хоста)
async function createSession() {
  const sessionRef = db.ref('sessions/' + sessionId);
  await sessionRef.set({});

  // Обработка новых участников
  db.ref('sessions/' + sessionId + '/participants').on('child_added', async snapshot => {
    const participantId = snapshot.key;
    if (participantId !== 'admin') {
      await connectToParticipant(participantId);
    }
  });
}

// Присоединение к сессии (для участников)
async function joinSession() {
  const sessionRef = db.ref('sessions/' + sessionId);
  await sessionRef.child('participants').child(participantId).set({});

  // Обработка входящих предложений
  db.ref(`sessions/${sessionId}/offers`).on('child_added', async snapshot => {
    const fromId = snapshot.key;
    const offer = snapshot.val();
    if (fromId !== participantId) {
      await handleOffer(fromId, offer);
    }
  });

  // Обработка ответов
  db.ref(`sessions/${sessionId}/answers`).on('child_added', async snapshot => {
    const fromId = snapshot.key;
    const answer = snapshot.val();
    if (peers[fromId]) {
      await peers[fromId].setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  // Обработка ICE
  db.ref(`sessions/${sessionId}/candidates`).on('child_added', snapshot => {
    const fromId = snapshot.key;
    const candidate = snapshot.val();
    if (peers[fromId]) {
      peers[fromId].addIceCandidate(new RTCIceCandidate(candidate));
    }
  });
}

// Создаем соединение для участника (для хоста)
async function connectToParticipant(participantId) {
  const pc = new RTCPeerConnection(configuration);
  peers[participantId] = pc;

  // Добавляем локальные дорожки
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // ICE кандидат
  pc.onicecandidate = e => {
    if (e.candidate) {
      firebase.database().ref(`sessions/${sessionId}/candidates/${participantId}`).push(e.candidate.toJSON());
    }
  };

  // Обработка входящих потоков
  pc.ontrack = e => {
    addRemoteStream(e.streams[0], participantId);
  };

  // Создаем предложение
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await firebase.database().ref(`sessions/${sessionId}/offers/${participantId}`).set(pc.localDescription.toJSON());

  // Ждем ответ
  firebase.database().ref(`sessions/${sessionId}/answers/${participantId}`).on('value', async snapshot => {
    const answer = snapshot.val();
    if (answer && !pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });
}

// Обработка входящего предложения (для участников)
async function handleOffer(fromId, offer) {
  const pc = new RTCPeerConnection(configuration);
  peers[fromId] = pc;

  // Добавляем локальные дорожки
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = e => {
    if (e.candidate) {
      firebase.database().ref(`sessions/${sessionId}/candidates/${fromId}`).push(e.candidate.toJSON());
    }
  };

  pc.ontrack = e => {
    addRemoteStream(e.streams[0], fromId);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await firebase.database().ref(`sessions/${sessionId}/answers/${fromId}`).set(pc.localDescription.toJSON());
}

// Добавляем видео другого участника
function addRemoteStream(stream, id) {
  let video = document.getElementById('remote_' + id);
  if (!video) {
    video = document.createElement('video');
    video.id = 'remote_' + id;
    video.autoplay = true;
    video.playsinline = true;
    remoteVideosContainer.appendChild(video);
  }
  video.srcObject = stream;
}