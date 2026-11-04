import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Physics, RigidBody } from '@react-three/rapier';
import { CanvasTexture, CatmullRomCurve3, ExtrudeGeometry, Group, PerspectiveCamera, RepeatWrapping, Shape, SRGBColorSpace, Vector3 } from 'three';
import { bookLook, carouselLayout, carouselPose, difficultyColors, inkColor, seed, shelfCapacity, SHELF_SLOT, wrapIndex } from './model';
import type { Problem } from './model';

interface Props {
  problems: Problem[];
  selectedId: string | null;
  paused: boolean;
  reduced: boolean;
  step: number;
  onSelect: (problem: Problem) => void;
  onHover: (problem: Problem | null) => void;
  onFallback: () => void;
}

function surfaceTexture(pages = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(128, 128);
  let random = 3719;
  for (let i = 0; i < pixels.data.length; i += 4) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const grain = 118 + (random % 24);
    pixels.data.set([grain, grain, grain, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  if (pages) {
    ctx.fillStyle = '#eee3ca'; ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 3) {
      ctx.fillStyle = x % 9 ? '#a79a7a66' : '#81725788';
      ctx.fillRect(x, 0, 1, 128);
    }
  } else {
    ctx.fillStyle = '#ffffff14';
    for (let i = 0; i < 128; i += 4) { ctx.fillRect(i, 0, 1, 128); ctx.fillRect(0, i, 128, 1); }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  if (pages) texture.colorSpace = SRGBColorSpace;
  else texture.repeat.set(2, 5);
  texture.anisotropy = 4;
  return texture;
}

const cloth = surfaceTexture();
const paper = surfaceTexture(true);

function printGrain(ctx: CanvasRenderingContext2D, id: string) {
  const grain = document.createElement('canvas');
  grain.width = 48; grain.height = 320;
  const noise = grain.getContext('2d')!;
  const pixels = noise.createImageData(grain.width, grain.height);
  let random = Math.floor(seed(id) * 4294967296);
  for (let i = 0; i < pixels.data.length; i += 4) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const value = 40 + (random >>> 24) * .69;
    pixels.data.set([value, value, value, 255], i);
  }
  noise.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grain, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function coverTexture(problem: Problem, back = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 640;
  const ctx = canvas.getContext('2d')!;
  const look = bookLook(problem);
  ctx.fillStyle = back ? look.bottom : look.top; ctx.fillRect(0, 0, 320, 640);
  ctx.fillStyle = back ? look.top : look.bottom;
  ctx.beginPath(); ctx.moveTo(0, 495); ctx.bezierCurveTo(85, 445, 230, 560, 320, 490); ctx.lineTo(320, 640); ctx.lineTo(0, 640); ctx.fill();
  printGrain(ctx, problem.id + (back ? ':back' : ':front'));
  const ink = inkColor(back ? look.bottom : look.top);
  ctx.strokeStyle = ink; ctx.globalAlpha = .35; ctx.lineWidth = 1.5; ctx.strokeRect(22, 22, 276, 596); ctx.globalAlpha = 1;
  ctx.fillStyle = ink; ctx.textAlign = 'center';
  ctx.font = '16px "Architects Daughter"'; ctx.fillText('LEETCODE ODYSSEY', 160, 67);
  ctx.font = '600 25px Fraunces'; ctx.fillText(`No. ${problem.id}`, 160, 116);
  const words = (back ? problem.topics.join(' / ') || 'A problem to think about' : problem.title).split(' ');
  ctx.font = `${back ? 400 : 600} ${back ? 20 : 29}px Fraunces`;
  let line = '', y = back ? 200 : 205;
  for (const word of words) {
    if (ctx.measureText(line + ' ' + word).width > 255 && line) {
      if (y > 430) break;
      ctx.fillText(line, 160, y, 255); line = word; y += back ? 28 : 36;
    } else line = line ? line + ' ' + word : word;
  }
  if (y <= 440) ctx.fillText(line, 160, y, 255);
  ctx.fillStyle = inkColor(back ? look.top : look.bottom);
  ctx.font = '18px "Architects Daughter"'; ctx.fillText(problem.difficulty, 160, 575);
  ctx.font = '24px Fraunces'; ctx.fillText('{ }', 160, 610);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function spineTexture(problem: Problem) {
  const canvas = document.createElement('canvas');
  const width = 192, height = 1280;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const look = bookLook(problem);
  const boundaries = [0, ...look.sections.map(s => s.end * height)];
  const amplitude = Math.min(48, ...look.sections.map(s => (s.end - s.start) * height * .22));
  const waves = boundaries.map((_, i) => i === 0 || i === boundaries.length - 1 ? 0 : (seed(problem.id + ':wave:' + i) > .5 ? 1 : -1) * amplitude);
  const paths = look.sections.map((_, i) => {
    const path = new Path2D();
    path.moveTo(0, boundaries[i]);
    path.bezierCurveTo(width * .32, boundaries[i] + waves[i], width * .62, boundaries[i] - waves[i], width, boundaries[i]);
    path.lineTo(width, boundaries[i + 1]);
    path.bezierCurveTo(width * .62, boundaries[i + 1] - waves[i + 1], width * .32, boundaries[i + 1] + waves[i + 1], 0, boundaries[i + 1]);
    path.closePath();
    return path;
  });
  look.sections.forEach((section, i) => { ctx.fillStyle = section.color; ctx.fill(paths[i]); });
  printGrain(ctx, problem.id + ':spine');
  function lettering(color: string) {
    ctx.fillStyle = color; ctx.textAlign = 'center';
    ctx.font = '30px "Architects Daughter"'; ctx.fillText(`#${problem.id}`, width / 2, 55);
    ctx.save(); ctx.translate(width / 2, 110); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const fontSize = problem.title.length > 75 ? 49 : 62;
    ctx.font = `600 ${fontSize}px Fraunces`;
    const lines: string[] = []; let line = '';
    for (const word of problem.title.split(' ')) {
      if (ctx.measureText(line + ' ' + word).width > 955 && line) { lines.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    lines.push(line);
    const fittedSize = Math.min(fontSize, 155 / lines.length);
    ctx.font = `600 ${fittedSize}px Fraunces`;
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, (i - (lines.length - 1) / 2) * fittedSize, 955);
    ctx.restore();
  }
  look.sections.forEach((section, i) => {
    ctx.save(); ctx.clip(paths[i]); lettering(inkColor(section.color)); ctx.restore();
  });
  // Keep binding highlights outside the title so its measured contrast remains valid.
  const binding = ctx.createLinearGradient(0, 0, width, 0);
  binding.addColorStop(0, '#00000066'); binding.addColorStop(.07, '#ffffff35'); binding.addColorStop(.15, '#ffffff00');
  binding.addColorStop(.87, '#00000000'); binding.addColorStop(1, '#00000044');
  ctx.fillStyle = binding; ctx.fillRect(0, 0, 12, height); ctx.fillRect(width - 12, 0, 12, height);
  const sticker = difficultyColors[problem.difficulty];
  ctx.beginPath(); ctx.arc(width / 2, 1190, 38, 0, Math.PI * 2);
  ctx.fillStyle = sticker; ctx.fill(); ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = inkColor(sticker);
  ctx.font = '600 37px Fraunces'; ctx.fillText(problem.difficulty[0], width / 2, 1190);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function BookShape({ problem, active = false }: { problem: Problem; active?: boolean }) {
  const look = bookLook(problem);
  const texture = useMemo(() => spineTexture(problem), [problem]);
  const front = useMemo(() => coverTexture(problem), [problem]);
  const back = useMemo(() => coverTexture(problem, true), [problem]);
  useEffect(() => () => { texture.dispose(); front.dispose(); back.dispose(); }, [texture, front, back]);
  return <group name={`book-${problem.id}`}>
    <mesh name="page-block" castShadow receiveShadow position={[0, 0, -.05]}>
      <boxGeometry args={[look.width - .08, look.height - .12, 1.52]} />
      <meshStandardMaterial map={paper} roughness={.95} bumpMap={paper} bumpScale={.012} />
    </mesh>
    {[1, -1].map(side => <group key={side} name={side === 1 ? 'front-cover' : 'back-cover'} position={[side * (look.width / 2 + .035), 0, -.02]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[.075, look.height + .10, 1.84]} />
        <meshStandardMaterial color={side === 1 ? look.top : look.bottom} roughness={.58} bumpMap={cloth} bumpScale={.022} />
      </mesh>
      <mesh position={[side * .04, 0, 0]} rotation={[0, side * Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[1.84, look.height + .10]} />
        <meshStandardMaterial map={side === 1 ? front : back} roughness={.72} bumpMap={cloth} bumpScale={.022} />
      </mesh>
    </group>)}
    <mesh name="bound-spine" position={[0, 0, .83]} castShadow receiveShadow>
      <boxGeometry args={[look.width + .05, look.height + .03, .13]} />
      <meshStandardMaterial color={look.bottom} roughness={.6} bumpMap={cloth} bumpScale={.02} />
      <mesh position={[0, 0, .068]} receiveShadow>
        <planeGeometry args={[look.width + .05, look.height + .03]} />
        <meshStandardMaterial map={texture} roughness={.68} bumpMap={cloth} bumpScale={.025} emissiveMap={texture} emissive="#ffffff" emissiveIntensity={.15} toneMapped={false} />
      </mesh>
    </mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * (look.width / 2 - .035), 0, .905]}>
      <boxGeometry args={[.018, look.height, .008]} /><meshStandardMaterial color={look.top} roughness={.38} metalness={.12} />
    </mesh>)}
    {active && <mesh position={[0, -look.height / 2 - .08, .96]}><boxGeometry args={[look.width * .65, .035, .04]} /><meshBasicMaterial color="#fff4d4" /></mesh>}
  </group>;
}

function StandingBook({ problem, distance, radius, phase, selected, reduced, onSelect, onHover }: {
  problem: Problem; distance: number; radius: number; phase: MutableRefObject<number>; selected: boolean; reduced: boolean;
  onSelect: Props['onSelect']; onHover: Props['onHover'];
}) {
  const position = useRef<Group>(null);
  const mesh = useRef<Group>(null);
  const hovered = useRef(false);
  const look = bookLook(problem);
  useFrame((_, delta) => {
    if (!mesh.current || !position.current) return;
    const pose = carouselPose(distance + phase.current, radius);
    position.current.position.set(pose.x, look.height / 2, pose.z);
    position.current.rotation.set(0, pose.angle, 0);
    const raised = selected || (!reduced && hovered.current);
    const blend = reduced ? 1 : Math.min(delta * 10, 1);
    mesh.current.position.z += ((raised ? 1.2 : 0) - mesh.current.position.z) * blend;
    mesh.current.position.y += ((raised ? .2 : 0) - mesh.current.position.y) * blend;
    mesh.current.rotation.set(0, 0, 0);
    mesh.current.scale.setScalar(mesh.current.scale.x + ((raised ? 1.07 : 1) - mesh.current.scale.x) * blend);
  });
  function hover(event: ThreeEvent<PointerEvent>, value: boolean) {
    event.stopPropagation(); hovered.current = value; onHover(value ? problem : null);
    (event.nativeEvent.target as HTMLCanvasElement).style.cursor = value ? 'pointer' : '';
  }
  return <group ref={position} name={`standing-${problem.id}`}>
    <group ref={mesh} onPointerOver={e => hover(e, true)} onPointerOut={e => hover(e, false)}
      onClick={e => { e.stopPropagation(); onSelect(problem); }}>
      <BookShape problem={problem} active={selected} />
    </group>
    {seed(problem.id + ':spacer') < .27 && <mesh castShadow receiveShadow position={[.91, 2.2 - look.height / 2, -.1]}>
      <boxGeometry args={[.27, 4.4, 1.1]} /><meshStandardMaterial color="#ffc400" roughness={.65} />
    </mesh>}
  </group>;
}

interface Drop { problem: Problem; x: number; z: number; angle: number; key: string }
function FallingBook({ item }: { item: Drop }) {
  const look = bookLook(item.problem);
  return <RigidBody position={[item.x, look.height / 2, item.z + .8]} rotation={[.08, item.angle, look.tilt]}
    colliders="cuboid" linearVelocity={[(seed(item.key) - .5) * 2, .4, .8]}
    angularVelocity={[.4, .2, (seed(item.key + 'spin') - .5) * 4]} restitution={.15}>
    <BookShape problem={item.problem} />
  </RigidBody>;
}

function CurvedShelf({ radius, span }: { radius: number; span: number }) {
  const { geometry, edge } = useMemo(() => {
    const shape = new Shape();
    const halfAngle = (span / 2 + SHELF_SLOT * 3) / radius;
    const points = Array.from({ length: 65 }, (_, i) => -halfAngle + i / 64 * halfAngle * 2);
    points.forEach((angle, i) => {
      const x = (radius + 1.05) * Math.sin(angle), z = (radius + 1.05) * Math.cos(angle) - radius;
      if (!i) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    });
    [...points].reverse().forEach(angle => shape.lineTo((radius - 1) * Math.sin(angle), -((radius - 1) * Math.cos(angle) - radius)));
    shape.closePath();
    const edge = new CatmullRomCurve3(points.map(angle => new Vector3((radius + 1.05) * Math.sin(angle), .01, (radius + 1.05) * Math.cos(angle) - radius)));
    return { geometry: new ExtrudeGeometry(shape, { depth: .18, bevelEnabled: false }), edge };
  }, [radius, span]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group name="curved-shelf">
    <mesh geometry={geometry} position={[0, -.18, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><meshStandardMaterial color="#353027" roughness={.85} /></mesh>
    <mesh><tubeGeometry args={[edge, 80, .013, 4, false]} /><meshBasicMaterial color="#ddd3bf" /></mesh>
  </group>;
}

function ShelfRow(props: Props) {
  const { size, camera } = useThree();
  const sequence = props.problems;
  const { capacity, span, radius } = carouselLayout(size.width);
  const count = Math.min(sequence.length, capacity + 2);
  const [start, setStart] = useState(0);
  const [falling, setFalling] = useState<Drop[]>([]);
  const phase = useRef(0);
  const pendingShift = useRef(0);
  const previous = useRef<Drop[]>([]);
  const generation = useRef(0);
  const left = (count - 1) * SHELF_SLOT / 2;
  const visible = Array.from({ length: count }, (_, i) => ({ problem: sequence[wrapIndex(start + i, sequence.length)], distance: i * SHELF_SLOT - left }));

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera;
    const pixelsPerUnit = Math.min(size.width / span, (size.height - 85) / 9.6);
    const distance = size.height / (2 * pixelsPerUnit * Math.tan(perspective.fov * Math.PI / 360));
    perspective.position.set(0, 6.2, distance);
    perspective.lookAt(0, 3.9, 0);
    perspective.updateProjectionMatrix();
  }, [camera, size.width, size.height, span]);

  useEffect(() => {
    const currentIds = new Set(props.problems.map(p => p.id));
    const outgoing = previous.current.filter(item => !currentIds.has(item.problem.id));
    generation.current++;
    if (!props.reduced && !props.paused && outgoing.length) {
      setFalling(outgoing.map(item => ({ ...item, key: `${item.problem.id}-${generation.current}` })));
      const timer = setTimeout(() => setFalling([]), 1800);
      return () => clearTimeout(timer);
    }
    setFalling([]);
  }, [props.problems, props.reduced, props.paused]);
  useLayoutEffect(() => {
    // Rebase the offset only after React commits the replacement book positions.
    phase.current -= pendingShift.current * SHELF_SLOT;
    pendingShift.current = 0;
  }, [start]);
  useEffect(() => { phase.current = 0; pendingShift.current = 0; setStart(0); }, [sequence]);
  const previousStep = useRef(props.step);
  useEffect(() => {
    const difference = props.step - previousStep.current;
    previousStep.current = props.step;
    setStart(s => s + difference * 5); phase.current = 0; pendingShift.current = 0;
  }, [props.step]);
  useEffect(() => {
    if (!props.selectedId) return;
    const index = sequence.findIndex(p => p.id === props.selectedId);
    if (index >= 0) { setStart(index - Math.floor(count / 2)); phase.current = 0; pendingShift.current = 0; }
  }, [props.selectedId, sequence, count]);

  useFrame((_, delta) => {
    previous.current = visible.map(item => ({ problem: item.problem, ...carouselPose(item.distance + phase.current, radius), key: item.problem.id }));
    if (props.paused || props.reduced || sequence.length <= capacity) return;
    phase.current += Math.min(delta, .05) * .42;
    const shift = Math.trunc(phase.current / SHELF_SLOT);
    if (shift && !pendingShift.current) { pendingShift.current = shift; setStart(s => s - shift); }
  });
  return <>
    {visible.map(item => <StandingBook key={item.problem.id} problem={item.problem} distance={item.distance} radius={radius} phase={phase} selected={props.selectedId === item.problem.id} reduced={props.reduced} onSelect={props.onSelect} onHover={props.onHover} />)}
    {falling.map(item => <FallingBook key={item.key} item={item} />)}
    <CurvedShelf radius={radius} span={span} />
  </>;
}

class ShelfBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

function Scene({ onReady, ...props }: Props & { onReady: () => void }) {
  const { size } = useThree();
  const shadowSpan = Math.max(12, shelfCapacity(size.width) * SHELF_SLOT);
  return <>
    <ambientLight intensity={1.2} />
    <directionalLight position={[-12, 18, 10]} intensity={2.5} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-shadowSpan} shadow-camera-right={shadowSpan}
      shadow-camera-top={15} shadow-camera-bottom={-15} shadow-camera-near={1} shadow-camera-far={80}
      shadow-bias={-.0002} shadow-normalBias={.025} shadow-radius={3} />
    <directionalLight position={[12, 6, 8]} intensity={.5} />
    <directionalLight position={[0, 12, -8]} intensity={.9} />
    <Suspense fallback={null}>
      <Physics gravity={[0, -18, 0]} paused={props.paused || props.reduced} timeStep="vary">
        <SceneReady onReady={onReady} />
        <ShelfRow {...props} />
      </Physics>
    </Suspense>
  </>;
}

export default function Bookshelf(props: Props) {
  const [fontsReady, setFontsReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const markReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    let alive = true;
    Promise.all([document.fonts.load('600 20px Fraunces'), document.fonts.load('400 16px "Architects Daughter"')])
      .then(() => { if (alive) setFontsReady(true); });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) setWebgl(false);
    else context.getExtension('WEBGL_lose_context')?.loseContext();
    return () => { alive = false; };
  }, []);
  const fallback = <div className="shelf-unavailable"><p>The 3D shelf isn’t available in this browser.</p><button onClick={props.onFallback}>Browse the problem list instead</button></div>;
  if (!webgl) return fallback;
  return <div className="shelf-canvas" data-testid="bookshelf" style={{ cursor: props.paused ? 'default' : undefined }}>
    {!ready && <p className="shelf-loading" role="status">Arranging the shelf…</p>}
    {fontsReady && <ShelfBoundary fallback={fallback}>
      <Canvas shadows camera={{ position: [0, 6.2, 20], fov: 40, near: .1, far: 200 }}
        dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        fallback={fallback} onCreated={({ gl }) => { gl.setClearColor('#000000', 0); }}>
        <Scene {...props} onReady={markReady} />
      </Canvas>
    </ShelfBoundary>}
    <div className="shelf-vignette" aria-hidden="true" />
  </div>;
}
