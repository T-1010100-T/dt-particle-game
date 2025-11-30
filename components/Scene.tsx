
import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { NumberParticles } from './NumberParticles';
import { UIState } from '../types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      color: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      color: any;
    }
  }
}

interface SceneProps {
  uiState: UIState;
}

const EnvironmentEffects: React.FC<{ bloomStrength: number }> = ({ bloomStrength }) => {
  return (
    <EffectComposer disableNormalPass>
      <Bloom 
        luminanceThreshold={0.15} 
        mipmapBlur 
        intensity={bloomStrength} 
        radius={0.6}
      />
    </EffectComposer>
  );
};

const CameraController: React.FC<{ handState: UIState['handInteraction'] }> = ({ handState }) => {
  const targetZ = useRef(16);
  const explodeSmooth = useRef(0); // 平滑的爆炸状态追踪
  
  useFrame((state, delta) => {
    // Default distance
    let desiredZ = 16;
    
    if (handState.isActive) {
      if (handState.gesture === 'OPEN') {
        // 粒子炸开时，快速拉远视角
        const intensity = 0.5 + (handState.handDistance * 0.5);
        explodeSmooth.current = THREE.MathUtils.lerp(explodeSmooth.current, intensity, delta * 4);
        desiredZ = THREE.MathUtils.lerp(16, 120, explodeSmooth.current); // 拉得更远
      } else if (handState.gesture === 'FIST') {
        // 握拳聚拢时，视角拉近
        explodeSmooth.current = THREE.MathUtils.lerp(explodeSmooth.current, 0, delta * 3);
        desiredZ = THREE.MathUtils.lerp(16, 10, handState.handDistance);
      } else {
        // 默认根据手距离调整
        explodeSmooth.current = THREE.MathUtils.lerp(explodeSmooth.current, 0, delta * 2);
        desiredZ = THREE.MathUtils.lerp(20, 12, handState.handDistance);
      }
    } else {
      // 手离开时缓慢恢复
      explodeSmooth.current = THREE.MathUtils.lerp(explodeSmooth.current, 0, delta * 1.5);
      desiredZ = 16 + explodeSmooth.current * 60; // 保持一段时间的远距离
    }

    // 更快的相机响应速度
    const lerpSpeed = handState.gesture === 'OPEN' ? 4.0 : 2.5;
    targetZ.current = THREE.MathUtils.lerp(targetZ.current, desiredZ, delta * lerpSpeed);
    state.camera.position.z = targetZ.current;
  });

  return null;
}

export const Scene: React.FC<SceneProps> = ({ uiState }) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 16], fov: 35 }} 
      dpr={[1, 1.5]} // 降低最大DPR提升性能
      gl={{ antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#020205']} />
      
      <CameraController handState={uiState.handInteraction} />

      <Suspense fallback={null}>
        <NumberParticles 
          count={uiState.particleCount}
          flowSpeed={uiState.flowSpeed}
          interactionRadius={uiState.interactionRadius}
          particleSize={uiState.particleSize}
          colorA={uiState.colorA}
          colorB={uiState.colorB}
          handInteraction={uiState.handInteraction}
          modelScale={uiState.modelScale}
          currentShape={uiState.currentShape}
        />
        
        <EnvironmentEffects bloomStrength={uiState.bloomStrength} />
      </Suspense>

      <OrbitControls 
        enablePan={false}
        enableZoom={true}
        minDistance={5}
        maxDistance={100}
        // Disabled autoRotate here because we rotate the mesh itself in NumberParticles
        autoRotate={false} 
      />
    </Canvas>
  );
};
