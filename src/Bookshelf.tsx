import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Physics, RigidBody } from '@react-three/rapier';
import { CanvasTexture, Group, SRGBColorSpace } from 'three';
import { bookLook, seed, wrapIndex } from './model';
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

function spineTexture(problem: Problem) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const look = bookLook(problem);
  const radians = look.angle * Math.PI / 180;
  const reach = (Math.abs(Math.sin(radians)) * 128 + Math.abs(Math.cos(radians)) * 768) / 2;
  const dx = Math.sin(radians) * reach, dy = -Math.cos(radians) * reach;
  const gradient = ctx.createLinearGradient(64 - dx, 384 - dy, 64 + dx, 384 + dy);
  gradient.addColorStop(0, look.top); gradient.addColorStop(1, look.bottom);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 768);
  const binding = ctx.createLinearGradient(0, 0, 128, 0);
  binding.addColorStop(0, '#00000045'); binding.addColorStop(.12, '#ffffff25');
  binding.addColorStop(.35, '#ffffff00'); binding.addColorStop(.9, '#00000000'); binding.addColorStop(1, '#00000035');
  ctx.fillStyle = binding; ctx.fillRect(0, 0, 128, 768);
  ctx.fillStyle = '#000000'; ctx.textAlign = 'center';
  ctx.font = '22px "Architects Daughter"'; ctx.fillText(`#${problem.id}`, 67, 39);
  ctx.save(); ctx.translate(68, 78); ctx.rotate(Math.PI / 2); ctx.textAlign = 'left';
  const fontSize = problem.title.length > 75 ? 32 : 42;
  ctx.font = `600 ${fontSize}px Fraunces`;
  const lines: string[] = []; let line = '';
  for (const word of problem.title.split(' ')) {
    if (ctx.measureText(line + ' ' + word).width > 566 && line) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  lines.push(line);
  const fittedSize = Math.min(fontSize, 112 / lines.length);
  ctx.font = `600 ${fittedSize}px Fraunces`;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, (i - (lines.length - 1) / 2) * fittedSize, 566);
  ctx.restore(); ctx.textAlign = 'center'; ctx.font = '21px "Architects Daughter"';
  ctx.fillText(problem.difficulty.toUpperCase(), 65, 688);
  ctx.lineWidth = 2; ctx.strokeStyle = '#18201988'; ctx.beginPath(); ctx.arc(65, 730, 19, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '18px Fraunces'; ctx.fillText('{ }', 65, 736);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  return texture;
}

function BookShape({ problem, active = false }: { problem: Problem; active?: boolean }) {
  const look = bookLook(problem);
  const texture = useMemo(() => spineTexture(problem), [problem]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group>
    <mesh>
      <boxGeometry args={[look.width, look.height, .64]} />
      <meshStandardMaterial attach="material-0" color="#dfdac7" roughness={.95} />
      <meshStandardMaterial attach="material-1" color={look.bottom} roughness={.8} />
      <meshStandardMaterial attach="material-2" color="#f0e9d5" roughness={.95} />
      <meshStandardMaterial attach="material-3" color={look.bottom} roughness={.8} />
      <meshBasicMaterial attach="material-4" map={texture} toneMapped={false} />
      <meshStandardMaterial attach="material-5" color={look.bottom} roughness={.8} />
    </mesh>
    <mesh position={[look.width / 2 + .01, 0, .31]}><boxGeometry args={[.025, look.height + .02, .04]} /><meshStandardMaterial color={look.bottom} /></mesh>
    {active && <mesh position={[0, -look.height / 2 - .08, .45]}><boxGeometry args={[look.width * .65, .035, .04]} /><meshBasicMaterial color="#fff4d4" /></mesh>}
  </group>;
}

function StandingBook({ problem, x, y, selected, reduced, onSelect, onHover }: {
  problem: Problem; x: number; y: number; selected: boolean; reduced: boolean;
  onSelect: Props['onSelect']; onHover: Props['onHover'];
}) {
  const mesh = useRef<Group>(null);
  const hovered = useRef(false);
  const look = bookLook(problem);
  useFrame((_, delta) => {
    if (!mesh.current) return;
    const raised = selected || (!reduced && hovered.current);
    const blend = reduced ? 1 : Math.min(delta * 10, 1);
    mesh.current.position.z += ((raised ? 1.2 : 0) - mesh.current.position.z) * blend;
    mesh.current.position.y += ((raised ? .2 : 0) - mesh.current.position.y) * blend;
    mesh.current.scale.setScalar(mesh.current.scale.x + ((raised ? 1.07 : 1) - mesh.current.scale.x) * blend);
  });
  function hover(event: ThreeEvent<PointerEvent>, value: boolean) {
    event.stopPropagation(); hovered.current = value; onHover(value ? problem : null);
  }
  return <group position={[x, y + look.height / 2, 0]} rotation={[0, -.20, look.tilt]}>
    <group ref={mesh} onPointerOver={e => hover(e, true)} onPointerOut={e => hover(e, false)}
      onClick={e => { e.stopPropagation(); onSelect(problem); }}>
      <BookShape problem={problem} active={selected} />
    </group>
  </group>;
}

interface Drop { problem: Problem; x: number; y: number; key: string }
function FallingBook({ item }: { item: Drop }) {
  const look = bookLook(item.problem);
  return <RigidBody position={[item.x, item.y + look.height / 2, .8]} rotation={[.08, -.2, look.tilt]}
    colliders="cuboid" linearVelocity={[(seed(item.key) - .5) * 2, .4, .8]}
    angularVelocity={[.4, .2, (seed(item.key + 'spin') - .5) * 4]} restitution={.15}>
    <BookShape problem={item.problem} />
  </RigidBody>;
}

const SLOT = 1.45;
function ShelfRow({ row, ...props }: Props & { row: number }) {
  const { viewport } = useThree();
  const sequence = useMemo(() => props.problems.filter((_, i) => i % 2 === row), [props.problems, row]);
  const count = Math.min(sequence.length, Math.ceil(viewport.width / SLOT) + 5);
  const [start, setStart] = useState(0);
  const [falling, setFalling] = useState<Drop[]>([]);
  const phase = useRef(0);
  const pendingShift = useRef(0);
  const moving = useRef<Group>(null);
  const previous = useRef<Drop[]>([]);
  const generation = useRef(0);
  const floor = viewport.height * (row === 0 ? .04 : -.44);
  const left = (count - 1) * SLOT / 2;
  const visible = Array.from({ length: count }, (_, i) => ({ problem: sequence[wrapIndex(start + i, sequence.length)], x: i * SLOT - left, y: floor, key: String(i) }));

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
  useEffect(() => {
    previous.current = visible.map(item => ({ ...item, x: item.x + phase.current }));
  });
  useLayoutEffect(() => {
    // Rebase the offset only after React commits the replacement book positions.
    phase.current -= pendingShift.current * SLOT;
    pendingShift.current = 0;
    if (moving.current) moving.current.position.x = phase.current;
  }, [start]);
  useEffect(() => { phase.current = 0; pendingShift.current = 0; setStart(0); if (moving.current) moving.current.position.x = 0; }, [sequence]);
  const previousStep = useRef(props.step);
  useEffect(() => {
    const difference = props.step - previousStep.current;
    previousStep.current = props.step;
    setStart(s => s + difference * 5); phase.current = 0; pendingShift.current = 0;
    if (moving.current) moving.current.position.x = 0;
  }, [props.step]);
  useEffect(() => {
    if (!props.selectedId) return;
    const index = sequence.findIndex(p => p.id === props.selectedId);
    if (index >= 0) { setStart(index - Math.floor(count / 2)); phase.current = 0; pendingShift.current = 0; if (moving.current) moving.current.position.x = 0; }
  }, [props.selectedId, sequence, count]);

  useFrame((_, delta) => {
    if (props.paused || props.reduced || sequence.length * SLOT <= viewport.width) return;
    phase.current += Math.min(delta, .05) * (row === 0 ? .45 : -.39);
    const shift = Math.trunc(phase.current / SLOT);
    if (shift && !pendingShift.current) { pendingShift.current = shift; setStart(s => s - shift); }
    if (moving.current) moving.current.position.x = phase.current;
  });
  return <>
    <group ref={moving}>
      {visible.map(item => <StandingBook key={item.problem.id} problem={item.problem} x={item.x} y={floor} selected={props.selectedId === item.problem.id} reduced={props.reduced} onSelect={props.onSelect} onHover={props.onHover} />)}
    </group>
    {falling.map(item => <FallingBook key={item.key} item={item} />)}
    <mesh position={[0, floor - .12, -.1]}><boxGeometry args={[viewport.width + 2, .18, 1.05]} /><meshStandardMaterial color="#24221d" roughness={.9} /></mesh>
    <mesh position={[0, floor - .035, .48]}><boxGeometry args={[viewport.width + 2, .018, .02]} /><meshBasicMaterial color="#e5deca" /></mesh>
    <mesh position={[0, floor - .20, .47]} rotation={[0, 0, -.0015]}><boxGeometry args={[viewport.width + 2, .015, .02]} /><meshBasicMaterial color="#a9a18f" /></mesh>
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
  return <>
    <ambientLight intensity={2.1} />
    <directionalLight position={[-8, 10, 15]} intensity={1.25} />
    <Suspense fallback={null}>
      <Physics gravity={[0, -18, 0]} paused={props.paused || props.reduced} timeStep="vary">
        <SceneReady onReady={onReady} />
        <ShelfRow {...props} row={0} />
        <ShelfRow {...props} row={1} />
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
    {!ready && <p className="shelf-loading" role="status">Arranging the shelves…</p>}
    {fontsReady && <ShelfBoundary fallback={fallback}>
      <Canvas orthographic camera={{ position: [0, .8, 30], zoom: 52, near: .1, far: 100 }}
        dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        fallback={fallback} onCreated={({ gl }) => { gl.setClearColor('#000000', 0); }}>
        <Scene {...props} onReady={markReady} />
      </Canvas>
    </ShelfBoundary>}
    <div className="shelf-vignette" aria-hidden="true" />
  </div>;
}
