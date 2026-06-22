/**
 * Artifact: the-state-window — The State Window
 * Manifest: content/artifacts/the-state-window/manifest.json
 *
 * Contract: default-export a mount function that builds the scene inside
 * `container` and returns a cleanup function that releases every resource
 * (RAF loops, listeners, observers, GPU objects). See docs/ARTIFACTS.md.
 */
import * as THREE from 'three';
import { createScene } from '@/lib/three-utils';
import { attachOrbit } from '@/lib/orbit';

const SLOTS = 32;
const RING_R = 9.5;
const PILLAR_H = 2.2;
const PILLAR_R = 0.3;
const SLOT_RATE = 2.5; // display-slots per second

function slotPos(slot: number, y: number): THREE.Vector3 {
  const a = ((slot % SLOTS) / SLOTS) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(a) * RING_R, y, Math.cos(a) * RING_R);
}

export default function mount(container: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const world = new THREE.Group();

  // 32 slot pillars in a ring — one per epoch slot
  const pillarGeo = new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 1.4, PILLAR_H, 8);
  const pillarMats: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0d1c2e, roughness: 0.7, metalness: 0.5 });
    const mesh = new THREE.Mesh(pillarGeo, mat);
    mesh.position.copy(slotPos(i, 0));
    world.add(mesh);
    pillarMats.push(mat);
  }

  // base ring connecting pillars
  const torusMesh = new THREE.Mesh(
    new THREE.TorusGeometry(RING_R, 0.14, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a3050, roughness: 0.9 }),
  );
  torusMesh.rotation.x = Math.PI / 2;
  world.add(torusMesh);

  // shared sphere geometry for the three state markers
  const sGeo = new THREE.SphereGeometry(0.52, 16, 12);

  // white = chain tip (latest)
  const tipSphere = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0.4, 0.4, 1.0),
    emissiveIntensity: 0.5,
    roughness: 0.15,
  }));

  // amber = agent's last-read state (1–2 slots behind)
  const agentSphere = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({
    color: 0xffaa22,
    emissive: new THREE.Color(0.8, 0.3, 0),
    emissiveIntensity: 0.5,
    roughness: 0.2,
  }));

  // green = finalized checkpoint (~2 real epochs behind, compressed to 16 display-slots)
  const finalSphere = new THREE.Mesh(sGeo, new THREE.MeshStandardMaterial({
    color: 0x22cc88,
    emissive: new THREE.Color(0, 0.5, 0.2),
    emissiveIntensity: 0.5,
    roughness: 0.2,
  }));

  world.add(tipSphere, agentSphere, finalSphere);

  const orbit = attachOrbit(canvas, { ambient: 0.07 });
  let lastT = 0;

  const handle = createScene(canvas, (t) => {
    const dt = Math.min(t - lastT, 0.05);
    lastT = t;

    const currentSlot = Math.floor(t * SLOT_RATE) % SLOTS;
    const agentSlot = (currentSlot - 2 + SLOTS) % SLOTS;
    const finalSlot = (currentSlot - 16 + SLOTS) % SLOTS;

    // colour pillars by recency
    for (let i = 0; i < SLOTS; i++) {
      const age = (currentSlot - i + SLOTS) % SLOTS;
      const m = pillarMats[i];
      if (age === 0) {
        m.color.setHex(0xe8eeff);
        m.emissive.setHex(0x5566ff);
        m.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 5.5);
      } else if (age < 5) {
        const f = (5 - age) / 5;
        m.color.setRGB(f * 0.25, f * 0.35, f * 0.75);
        m.emissive.setScalar(0);
        m.emissiveIntensity = 0;
      } else {
        const f = Math.max(0, (SLOTS - age) / SLOTS) * 0.3;
        m.color.setRGB(f * 0.15, f * 0.25, f * 0.45);
        m.emissive.setScalar(0);
        m.emissiveIntensity = 0;
      }
    }

    const yOff = PILLAR_H / 2 + 1.2;
    tipSphere.position.copy(slotPos(currentSlot, yOff + 0.16 * Math.sin(t * 2.1)));
    agentSphere.position.copy(slotPos(agentSlot, yOff + 0.16 * Math.sin(t * 2.1 + 1.2)));
    finalSphere.position.copy(slotPos(finalSlot, yOff + 0.16 * Math.sin(t * 2.1 + 2.4)));

    world.rotation.y += orbit.step(dt);
  }, { fov: 55, z: 36 });

  handle.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(5, 14, 9);
  handle.scene.add(sun, world);

  return () => {
    orbit.dispose();
    handle.dispose();
    canvas.remove();
  };
}
