import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { MeshDistortMaterial, Float, Stars } from "@react-three/drei";

export default function AnimatedBackground() {
  const [paused, setPaused] = useState(() => {
    if (typeof window === "undefined") return false;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    return Boolean(reduced || document.hidden);
  });

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    const updatePauseState = () => {
      setPaused(Boolean(document.hidden || media?.matches));
    };

    document.addEventListener("visibilitychange", updatePauseState);
    media?.addEventListener?.("change", updatePauseState);

    return () => {
      document.removeEventListener("visibilitychange", updatePauseState);
      media?.removeEventListener?.("change", updatePauseState);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#080c16]" />
      <div className="absolute inset-0 grid-bg" />

      {/* Top soft indigo glow */}
      <div
        className="glow-orb absolute -top-48 left-1/2 -translate-x-1/2 w-[900px] h-[520px]"
        style={{ background: "radial-gradient(ellipse, rgba(129, 140, 248, 0.14) 0%, transparent 70%)" }}
      />

      {/* Bottom-left soft seafoam teal glow */}
      <div
        className="glow-orb absolute -bottom-24 -left-24 w-[520px] h-[420px]"
        style={{ background: "radial-gradient(ellipse, rgba(45, 212, 191, 0.08) 0%, transparent 70%)", animationDelay: "3s" }}
      />

      {/* Right soft sky glow */}
      <div
        className="glow-orb absolute top-1/3 -right-40 w-[440px] h-[580px]"
        style={{ background: "radial-gradient(ellipse, rgba(125, 211, 252, 0.06) 0%, transparent 70%)", animationDelay: "6s" }}
      />

      <Canvas
        dpr={[1, 1.5]}
        frameloop={paused ? "never" : "always"}
        camera={{ position: [0, 0, 5] }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Stars radius={120} depth={60} count={900} factor={3} fade speed={0.35} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.45} color="#818cf8" />
        <Float speed={0.65} rotationIntensity={0.35} floatIntensity={0.45}>
          <mesh position={[3, -1, -4]} scale={1.2}>
            <torusKnotGeometry args={[1, 0.3, 64, 12]} />
            <MeshDistortMaterial
              color="#272e54"
              distort={0.3}
              speed={1.0}
              roughness={0.2}
              metalness={0.85}
              opacity={0.35}
              transparent
            />
          </mesh>
        </Float>
        <Float speed={0.9} rotationIntensity={0.5} floatIntensity={0.6}>
          <mesh position={[-3.5, 2, -5]} scale={0.8}>
            <octahedronGeometry args={[1]} />
            <MeshDistortMaterial
              color="#133d3c"
              distort={0.25}
              speed={1.4}
              roughness={0.25}
              metalness={0.75}
              opacity={0.28}
              transparent
            />
          </mesh>
        </Float>
      </Canvas>

      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 42%, rgba(8, 12, 22, 0.78) 100%)" }}
      />
    </div>
  );
}
