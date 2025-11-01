import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'https://unpkg.com/three@0.161.0/examples/jsm/renderers/CSS2DRenderer.js';

const container = document.getElementById('viewer');
// No user file input - data is fetched from /data/heights.csv bundled in the repo
const resetBtn = null;
const spacingInput = document.getElementById('spacing');
const tooltip = document.getElementById('tooltip');

let scene, camera, renderer, controls, raycaster, pointer;
let treesGroup = null;
let heightsData = []; // flattened array of length rows*cols; null or 0 means no tree
const DATA_COLS = 4;
const DATA_ROWS = 10;
const COL_LETTERS = ['B','A','M','C'];

let labelRenderer;

init();
animate();

function init(){
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcceaf0);

  // Camera
  camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(20, 20, 20);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.update();

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  // Ground grid
  const grid = new THREE.GridHelper(200, 100, 0x888888, 0xcccccc);
  scene.add(grid);

  // CSS2D renderer for labels
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0px';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);

  spacingInput.addEventListener('input', () => { if(heightsData.length) buildTrees(heightsData); });

  // Tabs
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(b => b.addEventListener('click', () => {
    const idx = parseInt(b.dataset.idx, 10) || 1;
    setActiveTab(idx);
    loadDataset(idx).catch(err => console.error('Failed to load dataset', idx, err));
  }));

  // Activate tab 1 by default
  setActiveTab(1);
  loadDataset(1).catch(err => console.error('Failed to load default dataset:', err));
}

function setActiveTab(idx){
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(b => {
    if(parseInt(b.dataset.idx,10) === idx) b.classList.add('active'); else b.classList.remove('active');
  });
}

function onWindowResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if(labelRenderer) labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(event){
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Load a bundled CSV located at /data/heights.csv
async function loadDataset(idx){
  // Try .xlsx first, then .csv fallback
  const xlsxUrl = `/data/dataset${idx}.xlsx`;
  const csvUrl = `/data/dataset${idx}.csv`;

  // Attempt XLSX
  try{
    const res = await fetch(xlsxUrl);
    if(res.ok){
      const ab = await res.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(ab), { type: 'array' });
      const first = workbook.SheetNames[0];
      const sheet = workbook.Sheets[first];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // rows is array of arrays; read up to DATA_ROWS rows and DATA_COLS cols
      const flat = [];
      for(let r=0;r<DATA_ROWS;r++){
        const row = rows[r] || [];
        for(let c=0;c<DATA_COLS;c++){
          const val = row[c];
          const num = parseFloat(String(val ?? '').replace(/[^0-9+-.eE]/g, ''));
          flat.push(isFinite(num) ? num : 0);
        }
      }
      heightsData = flat; // in cm
      buildTrees(heightsData);
      return;
    }
  }catch(err){
    console.warn('XLSX load failed for', xlsxUrl, err);
  }

  // Fallback to CSV
  const resCsv = await fetch(csvUrl);
  if(!resCsv.ok) throw new Error('Failed to fetch dataset CSV: ' + csvUrl + ' status=' + resCsv.status);
  const text = await resCsv.text();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  // If first row looks like header (non-numeric), skip it
  let dataLines = lines;
  const firstParts = lines[0].split(',').map(s=>s.trim());
  const firstVal = firstParts[0];
  if(firstVal && isNaN(parseFloat(firstVal))) dataLines = lines.slice(1);

  const flat = [];
  for(let r=0;r<DATA_ROWS;r++){
    const row = dataLines[r] ? dataLines[r].split(',') : [];
    for(let c=0;c<DATA_COLS;c++){
      const cell = row[c] ? row[c].trim() : '';
      const num = parseFloat(String(cell).replace(/[^0-9+-.eE]/g, ''));
      flat.push(isFinite(num) ? num : 0);
    }
  }
  heightsData = flat; // cm
  buildTrees(heightsData);
}

function resetScene(){
  heightsData = [];
  if(treesGroup){ scene.remove(treesGroup); treesGroup = null; }
}

function buildTrees(flatHeightsCm){
  if(treesGroup) { scene.remove(treesGroup); treesGroup = null; }
  treesGroup = new THREE.Group();

  // remove any previous CSS2D labels attached to scene (they are children of treesGroup which is removed)

  const cols = DATA_COLS;
  const rows = DATA_ROWS;
  const spacing = parseFloat(spacingInput.value) || 2;

  // Convert to meters and compute color mapping range excluding zeros
  const meters = flatHeightsCm.map(v => v / 100);
  const valid = meters.filter(v => v > 0);
  const minH = valid.length ? Math.min(...valid) : 0;
  const maxH = valid.length ? Math.max(...valid) : 0;

  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const i = r * cols + c;
      const cm = flatHeightsCm[i] || 0;
      if(!cm || cm === 0) continue; // skip zeros (no tree)
      const h = cm / 100; // meters

      const x = (c - (cols-1)/2) * spacing;
      const z = (r - (rows-1)/2) * spacing;

      // trunk
      const trunkHeight = Math.max(0.2, h * 0.4);
      const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.16, trunkHeight, 8);
      const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.set(x, trunkHeight/2, z);

      // foliage (cone)
      const foliageHeight = Math.max(0.5, h * 0.6);
      const foliageGeometry = new THREE.ConeGeometry(Math.max(0.25, h*0.15), foliageHeight, 12);
      // color by height (green -> yellowish for tall)
      const t = (h - minH) / Math.max(1e-6, (maxH - minH));
      const color = new THREE.Color();
      color.setHSL(0.33 - 0.33 * t, 0.6, 0.35);
      const foliageMaterial = new THREE.MeshStandardMaterial({ color });
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(x, trunkHeight + foliageHeight/2, z);

      const tree = new THREE.Group();
      tree.add(trunk);
      tree.add(foliage);
      tree.userData = { height_m: h, index: i, row: r, col: c };

      // Create a CSS2D label for this tree: letter + row-number (rows numbered from 1)
      const letter = COL_LETTERS[c] || String.fromCharCode(65 + c);
      const labelText = `${letter}${r+1}`;
      const div = document.createElement('div');
      div.className = 'tree-label';
      div.textContent = labelText;
      const labelObj = new CSS2DObject(div);
      // place label slightly above the foliage
      labelObj.position.set(0, trunkHeight + foliageHeight + 0.1, 0);
      tree.add(labelObj);

      treesGroup.add(tree);
    }
  }

  scene.add(treesGroup);
}

function animate(){
  requestAnimationFrame(animate);
  updateHover();
  renderer.render(scene, camera);
  // render DOM labels on top
  if(labelRenderer) labelRenderer.render(scene, camera);
}

let lastIntersect = null;
function updateHover(){
  if(!treesGroup) return;
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(treesGroup.children, true);
  if(intersects.length > 0){
    const it = intersects[0];
    // find parent tree group
    let obj = it.object;
    while(obj && !obj.userData?.height_m) obj = obj.parent;
    if(obj && obj.userData){
      if(lastIntersect !== obj){
        lastIntersect = obj;
      }
      // Position tooltip
      const pos = it.point.clone();
      pos.project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const x = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
      const y = ( -pos.y * 0.5 + 0.5) * rect.height + rect.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.remove('hidden');
      tooltip.textContent = `Height: ${obj.userData.height_m.toFixed(2)} m`;
    }
  } else {
    lastIntersect = null;
    tooltip.classList.add('hidden');
  }
}

// Optional: export function to programmatically load heights
export function loadHeights(arr){
  heightsData = arr.slice();
  buildTrees(heightsData);
}

// Expose minimal API for debugging in console
window.treeYard = {
  loadHeights,
  resetScene
};
