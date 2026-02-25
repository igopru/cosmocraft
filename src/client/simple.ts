import * as THREE from 'three';

console.log('Simple client started');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Свет
const ambientLight = new THREE.AmbientLight(0x404060);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(1, 2, 1);
scene.add(dirLight);

// Сетка
const gridHelper = new THREE.GridHelper(20, 20, 0x4444ff, 0x888888);
scene.add(gridHelper);

// Оси
// const axesHelper = new THREE.AxesHelper(5);
// scene.add(axesHelper);

// Несколько кубов
const colors = [0xff3333, 0x33ff33, 0x3333ff, 0xffff33, 0xff33ff];
for (let i = 0; i < 5; i++) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: colors[i] });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(i - 2, 0.5, 0);
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);
}

// Звезды
const starsGeometry = new THREE.BufferGeometry();
const starsCount = 1000;
const starsPositions = new Float32Array(starsCount * 3);
for (let i = 0; i < starsCount * 3; i += 3) {
    starsPositions[i] = (Math.random() - 0.5) * 200;
    starsPositions[i+1] = (Math.random() - 0.5) * 200;
    starsPositions[i+2] = (Math.random() - 0.5) * 200;
}
starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2 });
const stars = new THREE.Points(starsGeometry, starsMaterial);
scene.add(stars);

// Анимация
function animate() {
    requestAnimationFrame(animate);
    
    // Вращаем звезды
    stars.rotation.y += 0.0001;
    
    renderer.render(scene, camera);
}

animate();

// Обработка resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
