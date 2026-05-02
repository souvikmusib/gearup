'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  Gauge,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

const services = [
  {
    title: 'Race-Ready General Service',
    detail: 'Oil, filter, chain, brake, clutch, and safety checks in one disciplined flow.',
    icon: Wrench,
  },
  {
    title: 'Engine Diagnostics',
    detail: 'Compression, noise, heat, and sensor checks before repair work starts.',
    icon: Gauge,
  },
  {
    title: 'Brake & Clutch Precision',
    detail: 'Pad wear, cable feel, lever travel, bleeding, and road-test validation.',
    icon: ShieldCheck,
  },
  {
    title: 'Electrical & Scan',
    detail: 'Battery, charging, lighting, wiring, and fault tracing for daily reliability.',
    icon: Zap,
  },
];

const process = [
  ['01', 'Book', 'Share bike details and issue notes. Pick the service window that fits your day.'],
  ['02', 'Inspect', 'Technicians run a bay-side check and confirm spares, labor, and estimate.'],
  ['03', 'Repair', 'Work gets tracked through job cards, updates, and final quality inspection.'],
  ['04', 'Ride', 'Collect after payment, invoice, and safety checklist are ready.'],
];

function connectPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), material);

  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildSpokedWheel(
  center: THREE.Vector3,
  materials: { tire: THREE.Material; red: THREE.Material; metal: THREE.Material },
) {
  const group = new THREE.Group();
  group.position.copy(center);

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.13, 24, 96), materials.tire);
  tire.castShadow = true;
  tire.receiveShadow = true;
  group.add(tire);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.035, 12, 72), materials.red);
  rim.position.z = 0.02;
  group.add(rim);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 32), materials.metal);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.04;
  group.add(hub);

  const origin = new THREE.Vector3(0, 0, 0.06);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(angle) * 0.58, Math.sin(angle) * 0.58, 0.06);
    group.add(connectPoints(origin, end, 0.01, materials.metal));
  }

  return group;
}

function MotoScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvas?.parentElement;
    if (!canvas || !wrapper) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0.35, 1.15, 9.4);

    const root = new THREE.Group();
    root.rotation.set(-0.08, -0.24, 0);
    scene.add(root);

    const red = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x2b0000,
      metalness: 0.62,
      roughness: 0.26,
    });
    const darkRed = new THREE.MeshStandardMaterial({
      color: 0xac0000,
      emissive: 0x120000,
      metalness: 0.72,
      roughness: 0.32,
    });
    const tire = new THREE.MeshStandardMaterial({
      color: 0x060606,
      metalness: 0.15,
      roughness: 0.68,
    });
    const metal = new THREE.MeshStandardMaterial({
      color: 0xd7d7d7,
      metalness: 0.9,
      roughness: 0.18,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.5,
      roughness: 0.42,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xfff1df,
      emissive: 0xff2a00,
      emissiveIntensity: 0.65,
      metalness: 0.1,
      roughness: 0.12,
    });

    const leftWheel = buildSpokedWheel(new THREE.Vector3(-2.35, -0.96, 0), { tire, red, metal });
    const rightWheel = buildSpokedWheel(new THREE.Vector3(2.2, -0.96, 0), { tire, red, metal });
    root.add(leftWheel, rightWheel);

    root.add(
      connectPoints(
        new THREE.Vector3(-2.35, -0.55, 0),
        new THREE.Vector3(-0.25, 0.46, 0),
        0.055,
        metal,
      ),
    );
    root.add(
      connectPoints(
        new THREE.Vector3(2.2, -0.55, 0),
        new THREE.Vector3(0.6, 0.48, 0),
        0.055,
        metal,
      ),
    );
    root.add(
      connectPoints(
        new THREE.Vector3(-0.25, 0.46, 0),
        new THREE.Vector3(0.6, 0.48, 0),
        0.06,
        metal,
      ),
    );
    root.add(
      connectPoints(
        new THREE.Vector3(-1.55, -0.74, 0),
        new THREE.Vector3(0.15, 0.22, 0),
        0.045,
        metal,
      ),
    );
    root.add(
      connectPoints(new THREE.Vector3(1.2, 0.3, 0), new THREE.Vector3(2.58, 0.82, 0), 0.04, metal),
    );
    root.add(
      connectPoints(new THREE.Vector3(2.2, -0.52, 0), new THREE.Vector3(2.7, 0.6, 0), 0.05, metal),
    );

    const tank = new THREE.Mesh(new THREE.DodecahedronGeometry(0.76, 0), red);
    tank.scale.set(1.75, 0.58, 0.5);
    tank.position.set(0.05, 0.55, 0.02);
    tank.rotation.set(0.05, 0.04, -0.05);
    tank.castShadow = true;
    root.add(tank);

    const fairing = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.38, 0.44), darkRed);
    fairing.position.set(1.02, 0.21, 0.02);
    fairing.rotation.z = -0.08;
    fairing.castShadow = true;
    root.add(fairing);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.18, 0.5), black);
    seat.position.set(-0.98, 0.92, 0.02);
    seat.rotation.z = -0.1;
    seat.castShadow = true;
    root.add(seat);

    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.46, 32), black);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(-0.38, -0.1, 0.04);
    engine.castShadow = true;
    root.add(engine);

    const headLamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), glass);
    headLamp.scale.set(1.05, 0.76, 0.55);
    headLamp.position.set(2.72, 0.5, 0.14);
    root.add(headLamp);

    const exhaust = connectPoints(
      new THREE.Vector3(-0.95, -0.45, -0.18),
      new THREE.Vector3(1.65, -0.42, -0.18),
      0.06,
      metal,
    );
    exhaust.rotation.z = -0.05;
    root.add(exhaust);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.16, 1.05), black);
    platform.position.set(0, -1.98, -0.08);
    platform.receiveShadow = true;
    root.add(platform);

    const liftEdge = new THREE.Mesh(new THREE.BoxGeometry(5.35, 0.045, 1.12), red);
    liftEdge.position.set(0, -1.86, -0.08);
    root.add(liftEdge);

    const wrenchBar = connectPoints(
      new THREE.Vector3(-3.2, 1.35, -0.2),
      new THREE.Vector3(-2.42, 0.62, -0.2),
      0.035,
      red,
    );
    const wrenchRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 32), red);
    wrenchRing.position.set(-3.28, 1.42, -0.2);
    wrenchRing.rotation.z = 0.65;
    root.add(wrenchBar, wrenchRing);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(3, 5, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff0000, 35, 12);
    rimLight.position.set(-2.8, 1.8, 2.4);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x808080, 1.2));

    const pointer = { x: 0, y: 0 };
    const startedAt = performance.now();
    let frame = 0;

    const resize = () => {
      const width = Math.max(wrapper.clientWidth, 1);
      const height = Math.max(wrapper.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = wrapper.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    const animate = () => {
      const elapsed = (performance.now() - startedAt) / 1000;

      if (!reduceMotion) {
        leftWheel.rotation.z = -elapsed * 0.95;
        rightWheel.rotation.z = -elapsed * 0.95;
        root.rotation.y += (-0.26 + pointer.x * 0.18 - root.rotation.y) * 0.055;
        root.rotation.x += (-0.1 - pointer.y * 0.09 - root.rotation.x) * 0.055;
        root.position.y = Math.sin(elapsed * 1.1) * 0.06;
        headLamp.scale.x = 1 + Math.sin(elapsed * 2.5) * 0.05;
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };

    resize();
    wrapper.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', resize);
    animate();

    return () => {
      cancelAnimationFrame(frame);
      wrapper.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      data-testid="moto-canvas"
      aria-label="3D motorcycle service bay animation"
    />
  );
}

export function LandingExperience() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.registerPlugin(ScrollTrigger);

    const context = gsap.context(() => {
      gsap.from('[data-reveal]', {
        autoAlpha: 0,
        y: 28,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.08,
      });

      gsap.to('[data-parallax-slow]', {
        y: reduceMotion ? 0 : -90,
        ease: 'none',
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });

      gsap.from('[data-service-tile]', {
        autoAlpha: 0,
        y: 24,
        duration: 0.65,
        ease: 'power2.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: '[data-service-grid]',
          start: 'top 78%',
        },
      });
    }, root);

    const layers = root.querySelectorAll<HTMLElement>('[data-depth]');
    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion) return;
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;

      layers.forEach((layer) => {
        const depth = Number(layer.dataset.depth || 0);
        gsap.to(layer, {
          x: x * depth,
          y: y * depth,
          duration: 0.75,
          ease: 'power3.out',
        });
      });
    };

    window.addEventListener('pointermove', onPointerMove);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      context.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="overflow-hidden bg-[#050505] text-white">
      <section className="relative min-h-[78svh] overflow-hidden border-b border-red-950/60 bg-[#050505]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(255,0,0,0.25),transparent_34%),linear-gradient(135deg,#050505_0%,#141414_46%,#060606_100%)]" />
        <img
          aria-hidden="true"
          data-depth="-12"
          src="/landing/back-texture.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-[0.16] mix-blend-screen"
        />
        <img
          aria-hidden="true"
          data-depth="18"
          data-parallax-slow
          src="/landing/gearup-mark.webp"
          alt=""
          className="absolute -right-24 top-12 w-[32rem] max-w-none opacity-[0.12] sm:w-[42rem] lg:-right-28 lg:w-[50rem]"
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#050505] to-transparent" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:pb-14 lg:pt-10">
          <div className="relative z-10 max-w-2xl">
            <img
              data-reveal
              src="/landing/gearup-banner.webp"
              alt="GearUp - Service. Spares. Safety."
              className="mb-8 h-auto w-full max-w-[34rem]"
            />
            <div
              data-reveal
              className="mb-5 inline-flex items-center gap-2 rounded-md border border-red-500/[0.35] bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100"
            >
              <Sparkles size={16} />
              Professional motorbike service bay
            </div>
            <h1
              data-reveal
              className="text-5xl font-black leading-[0.95] text-white sm:text-6xl lg:text-7xl"
            >
              GearUp Motorcycle Service
            </h1>
            <p data-reveal className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg">
              A sharp, transparent servicing workflow for riders who care about speed, spares, and
              safety. Book online, track repair progress, and collect only after final inspection.
            </p>
            <div data-reveal className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                prefetch={false}
                href="/book-service"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[linear-gradient(100deg,#ff0000,#ac0000)] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_50px_rgba(255,0,0,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_60px_rgba(255,0,0,0.38)]"
              >
                Book Service
                <ArrowRight size={17} />
              </Link>
              <Link
                prefetch={false}
                href="/track"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.16] bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:border-red-500/60 hover:bg-red-500/10"
              >
                Track Request
                <Search size={17} />
              </Link>
            </div>

            <div data-reveal className="mt-8 hidden max-w-xl grid-cols-3 gap-2 text-sm sm:grid">
              {[
                ['8+', 'service lanes'],
                ['24h', 'estimate flow'],
                ['100%', 'safety check'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <p className="text-xl font-black text-white">{value}</p>
                  <p className="mt-1 text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 bottom-[-4.5rem] z-0 min-h-[360px] opacity-65 sm:bottom-[-2rem] sm:min-h-[430px] lg:pointer-events-auto lg:relative lg:inset-auto lg:z-auto lg:min-h-[620px] lg:opacity-100"
            data-reveal
          >
            <MotoScene />
            <div
              data-depth="10"
              className="absolute left-1 top-4 hidden rounded-lg border border-red-500/[0.35] bg-black/60 px-4 py-3 shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur-md sm:left-8 sm:block"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white">
                  <Bike size={19} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Live Bay</p>
                  <p className="text-xs text-zinc-400">3D service inspection</p>
                </div>
              </div>
            </div>
            <div
              data-depth="-9"
              className="absolute bottom-8 right-2 hidden rounded-lg border border-white/[0.12] bg-black/60 px-4 py-3 shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur-md sm:right-8 sm:block"
            >
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-sm bg-red-500 shadow-[0_0_24px_rgba(255,0,0,0.9)]" />
                <p className="text-sm font-semibold text-zinc-100">diagnostics running</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-b border-red-950/50 bg-[#090909] py-8">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:px-6 lg:grid-cols-3">
          {[
            { icon: MapPin, label: 'Milanpally, Katjuridanga, Bankura' },
            { icon: Phone, label: '+91 9242519099' },
            { icon: CalendarClock, label: 'Book, inspect, repair, collect' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4"
            >
              <item.icon className="text-red-500" size={20} />
              <span className="text-sm font-semibold text-zinc-200">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#f6f6f3] py-16 text-zinc-950 sm:py-20">
        <img
          aria-hidden="true"
          data-depth="-8"
          src="/landing/front-texture.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-[0.1]"
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className="text-sm font-black text-red-700">SERVICE. SPARES. SAFETY.</p>
              <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
                Built around real workshop flow.
              </h2>
            </div>
            <p className="max-w-3xl text-base leading-7 text-zinc-600 sm:text-lg">
              The landing experience now mirrors the brand system from your supplied assets: deep
              black, hard red, bevel-like depth, linear red gradient, and high-motion mechanical
              cues.
            </p>
          </div>

          <div data-service-grid className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <article
                key={service.title}
                data-service-tile
                className="rounded-lg border border-zinc-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,15,15,0.08)]"
              >
                <service.icon className="text-red-600" size={26} />
                <h3 className="mt-5 text-xl font-black leading-6">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">{service.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#050505] py-16 sm:py-20">
        <img
          aria-hidden="true"
          data-parallax-slow
          src="/landing/brand-frame-1.webp"
          alt=""
          className="absolute inset-x-0 top-0 mx-auto w-full max-w-none opacity-[0.13] mix-blend-screen"
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <p className="text-sm font-black text-red-500">HOW IT WORKS</p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              From first click to road test.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">
              Every job moves through a visible sequence, so riders know what is happening before a
              wrench touches the bike.
            </p>
          </div>

          <div className="grid gap-3">
            {process.map(([number, title, detail]) => (
              <div
                key={number}
                className="grid gap-4 rounded-lg border border-white/10 bg-white/[0.035] p-5 sm:grid-cols-[5rem_1fr]"
              >
                <div className="text-4xl font-black text-red-600">{number}</div>
                <div>
                  <h3 className="text-xl font-black text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-red-950/60 bg-[linear-gradient(100deg,#ff0000,#ac0000)] py-14 text-white">
        <img
          aria-hidden="true"
          data-depth="12"
          src="/landing/gearup-mark.webp"
          alt=""
          className="absolute -bottom-36 -right-16 w-[28rem] opacity-20"
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-4xl font-black leading-tight sm:text-5xl">
              Ready for a cleaner service run?
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-red-50">
              Book your motorcycle service and track the job card from estimate to delivery.
            </p>
          </div>
          <Link
            prefetch={false}
            href="/book-service"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-black text-zinc-950 transition hover:translate-y-[-1px] sm:w-auto"
          >
            Start Booking
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
