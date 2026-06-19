// Ваша конфигурация Firebase
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

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Элементы DOM
const progressBar = document.getElementById('progress-bar');
const requestButton = document.getElementById('requestAccess');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let peerConnection;

// TURN сервер с вашими данными
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { 
      urls: 'turn:wawqdfr1:3478', // Используйте ваш TURN сервер и порт
      username: 'wawqdfr1',
      credential: 'lol123lol'
    }
  ]
};

// Обработчик кнопки
requestButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true });
    localVideo.srcObject = localStream;
    updateProgress(50);
    await firebase.database().ref('access').set({ granted: true });
    startPeerConnection();
    updateProgress(100);
  } catch (e) {
    alert('Ошибка доступа к камере: ' + e);
  }
};

function updateProgress(percent) {
  progressBar.style.width = percent + '%';
}

async function startPeerConnection() {
  peerConnection = new RTCPeerConnection(configuration);

  // Добавляем локальные треки
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // ICE кандидатуры
  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      firebase.database().ref('candidates').push(event.candidate.toJSON());
    }
  };

  // Получение удаленного потока
  peerConnection.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Создаем предложение
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await firebase.database().ref('offer').set(peerConnection.localDescription.toJSON());

  // Ожидаем ответ
  firebase.database().ref('answer').on('value', async snapshot => {
    const answer = snapshot.val();
    if (answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  // Обработка входящих ICE кандидатур
  firebase.database().ref('candidates').on('child_added', async snapshot => {
    const candidate = new RTCIceCandidate(snapshot.val());
    await peerConnection.addIceCandidate(candidate);
  });
}