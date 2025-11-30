
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler';
import { shaderMaterial } from '@react-three/drei';
import { HandInteractionState, ShapeType } from '../types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      points: any;
      particleMaterial: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      points: any;
      particleMaterial: any;
    }
  }
}

// --- Custom Shader Material ---
const ParticleMaterial = shaderMaterial(
  {
    uTime: 0,
    uMouse: new THREE.Vector3(1000, 1000, 1000), // Default far away
    uColorA: new THREE.Color('#00ffff'),
    uColorB: new THREE.Color('#aa00ff'),
    uFlowSpeed: 1.0,
    uInteractionRadius: 2.0,
    uPixelRatio: 1.0,
    uSizeMultiplier: 1.0,
    uModelScale: 1.0,
    // Gesture Uniforms
    uExplode: 0.0, // 0 to 1
    uGather: 0.0,  // 0 to 1
    // Morph Uniform
    uMorph: 0.0, // 0 (start) to 1 (target)
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform vec3 uMouse;
    uniform float uFlowSpeed;
    uniform float uInteractionRadius;
    uniform float uPixelRatio;
    uniform float uSizeMultiplier;
    uniform float uModelScale;
    uniform float uExplode;
    uniform float uGather;
    uniform float uMorph;

    attribute vec3 aRandom;
    attribute float aSize;
    attribute vec3 aTarget; // The target position for morphing

    varying float vDistance;

    // Simplex Noise 3D function
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;

      i = mod289(i);
      vec4 p = permute( permute( permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );

      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );

      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);

      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                    dot(p2,x2), dot(p3,x3) ) );
    }

    // Rotation matrix
    mat3 rotation3d(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      return mat3(
        oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
      );
    }

    void main() {
      // 0. MORPHING
      // We interpolate between 'position' (start) and 'aTarget' (end)
      vec3 mixedPos = mix(position, aTarget, smoothstep(0.0, 1.0, uMorph));

      // 1. Apply Global Model Scale
      vec3 originalPos = mixedPos * uModelScale;
      vec3 pos = originalPos;
      
      vDistance = length(pos.xy); 
      
      // 2. Fluid Motion
      float noiseAmp = 1.0 - (uGather * 0.95); 
      float time = uTime * (0.2 + uFlowSpeed * 0.8);
      float turbulence = 0.15 * (0.5 + uFlowSpeed * 0.5); 
      
      float n1 = snoise(vec3(pos.x * 0.3, pos.y * 0.3, time * 0.15));
      float n2 = snoise(vec3(pos.x * 0.8 + 10.0, pos.y * 0.8 + time * 0.1, time * 0.2));
      
      pos.x += n1 * turbulence * noiseAmp;
      pos.y += n2 * turbulence * noiseAmp;
      pos.z += snoise(vec3(pos.xy * 0.5, time * 0.1)) * 0.1 * noiseAmp;

      // 3. Artistic Explosion Logic - 粒子扩散到满屏
      vec3 explosionOffset = vec3(0.0);
      
      if (uExplode > 0.01) {
          vec3 randomDir = normalize(vec3(
              aRandom.x - 0.5,
              aRandom.y - 0.5,
              aRandom.z - 0.5
          ));
          float twistAngle = length(originalPos.xy) * uExplode * 2.0;
          vec3 twistedPos = rotation3d(vec3(0.0, 0.0, 1.0), twistAngle) * originalPos;
          vec3 explodeDir = normalize(twistedPos + randomDir * 2.0);
          float distFromCenter = length(originalPos);
          // 超大爆炸范围 - 让粒子扩散到整个屏幕
          float explosionReach = 200.0;
          float speed = (1.0 + aRandom.x * 0.5) * (0.8 + distFromCenter * 0.3);
          explosionOffset = explodeDir * uExplode * uExplode * explosionReach * speed;
          explosionOffset += randomDir * uExplode * 30.0; // 更大的随机扩散
      }

      float explodeSuppression = 1.0 - (uGather * 1.0);
      explodeSuppression = clamp(explodeSuppression, 0.0, 1.0);
      pos += explosionOffset * explodeSuppression;

      // 5. Gather Logic (Fist)
      // Pull tightly to original shape.
      pos = mix(pos, originalPos, uGather * 0.9);

      // 6. Mouse Interaction
      float dist = distance(pos, uMouse);
      if (dist < uInteractionRadius && uGather < 0.1) {
        vec3 dir = normalize(pos - uMouse);
        float force = (uInteractionRadius - dist) / uInteractionRadius;
        force = pow(force, 2.0) * 3.0; 
        pos += dir * force;
      }

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // 7. Size Attenuation
      float breath = 1.0 + sin(time * 2.0 + aRandom.x * 10.0) * 0.2;
      // 爆炸时粒子变大！让用户能看清
      float explodeScale = 1.0 + uExplode * 4.0; // 爆炸时放大5倍
      
      gl_PointSize = aSize * breath * explodeScale * uPixelRatio * uSizeMultiplier;
      // 距离衰减减弱，让远处粒子也清晰
      gl_PointSize *= (50.0 / -mvPosition.z); 
      gl_PointSize = max(2.0, gl_PointSize); // 最小2像素 
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uExplode;

    varying float vDistance;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      float d = distance(gl_PointCoord, center);
      float alpha = 1.0 - smoothstep(0.3, 0.5, d);
      
      if (alpha < 0.01) discard;

      float mixFactor = smoothstep(1.0, 6.0, vDistance);
      
      // 爆炸时颜色更亮，像烟花一样
      vec3 colA = mix(uColorA, vec3(1.0, 0.95, 0.7), uExplode * 0.8);
      vec3 colB = mix(uColorB, vec3(1.0, 0.6, 0.2), uExplode * 0.8);
      
      vec3 finalColor = mix(colA, colB, mixFactor);
      finalColor += vec3(0.8) * smoothstep(0.0, 0.1, 0.1 - d);
      // 爆炸时大幅增加亮度
      finalColor *= (1.0 + uExplode * 1.5);

      // 爆炸时完全不透明
      float explodeAlpha = 1.0;
      
      gl_FragColor = vec4(finalColor, alpha * explodeAlpha);
    }
  `
);

extend({ ParticleMaterial });

interface NumberParticlesProps {
  count: number;
  flowSpeed: number;
  interactionRadius: number;
  particleSize: number;
  colorA: string;
  colorB: string;
  handInteraction: HandInteractionState;
  modelScale: number;
  currentShape: ShapeType;
}

const sampleGeometry = (geometry: THREE.BufferGeometry, count: number, spreadZ = 2.0): Float32Array => {
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)).build();
  const positions = new Float32Array(count * 3);
  const tempPosition = new THREE.Vector3();
  
  for (let i = 0; i < count; i++) {
    sampler.sample(tempPosition);
    positions[i * 3] = tempPosition.x;
    positions[i * 3 + 1] = tempPosition.y;
    // Add volume
    positions[i * 3 + 2] = tempPosition.z + (Math.random() - 0.5) * spreadZ; 
  }
  return positions;
};

export const NumberParticles: React.FC<NumberParticlesProps> = ({ 
  count,
  flowSpeed, 
  interactionRadius,
  particleSize,
  colorA, 
  colorB,
  handInteraction,
  modelScale,
  currentShape
}) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const materialRef = useRef<THREE.ShaderMaterial>(null!);
  const { camera } = useThree();
  
  // 复用 Vector3 对象，避免每帧创建新对象
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  const tempDir = useMemo(() => new THREE.Vector3(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  
  // Buffers for morphing
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  
  // Morph State
  const morphProgress = useRef(1.0); // 1.0 means complete
  const isMorphing = useRef(false);

  // Initialize Geometry ONCE
  useEffect(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const targets = new Float32Array(count * 3);
    const randomness = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      randomness[i * 3] = Math.random();
      randomness[i * 3 + 1] = Math.random();
      randomness[i * 3 + 2] = Math.random();
      sizes[i] = Math.random() * 2.0 + 0.5;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(targets, 3));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(randomness, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    
    setGeometry(geo);
  }, [count]);


  // Handle Shape Changes (Morphing Logic)
  useEffect(() => {
    if (!geometry) return;

    const generateNewPositions = async () => {
      let tempPositions: Float32Array;

      switch (currentShape) {
        case 'PYRAMID': {
          const geom = new THREE.ConeGeometry(5, 7, 4);
          tempPositions = sampleGeometry(geom, count);
          break;
        }
        case 'CUBE': {
          const geom = new THREE.BoxGeometry(6, 6, 6);
          tempPositions = sampleGeometry(geom, count);
          break;
        }
        case 'PLANET': {
          // 更完美的球体 - 使用体积采样而不是表面采样
          const sphereCount = Math.floor(count * 0.6);
          const ringCount = count - sphereCount;
          const sphereRadius = 3.5;
          
          // 球体：使用均匀球体体积采样
          const spherePos = new Float32Array(sphereCount * 3);
          for (let i = 0; i < sphereCount; i++) {
            // 使用球坐标均匀分布
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            // 体积采样：r^3 均匀分布
            const r = sphereRadius * Math.cbrt(0.85 + Math.random() * 0.15); // 主要在表面附近
            spherePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            spherePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            spherePos[i * 3 + 2] = r * Math.cos(phi);
          }
          
          // 土星环：真实的环绕效果
          // 环倾斜角度（像土星一样约26.7度）
          const tiltAngle = 25 * Math.PI / 180;
          const cosTilt = Math.cos(tiltAngle);
          const sinTilt = Math.sin(tiltAngle);
          
          const ringPos = new Float32Array(ringCount * 3);
          for (let i = 0; i < ringCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            // 多层环带：内环到外环
            const ringRadius = 5.0 + Math.random() * 2.5;
            // 环的厚度很薄
            const ringThickness = (Math.random() - 0.5) * 0.1;
            
            // 先计算水平环的位置
            const x = Math.cos(angle) * ringRadius;
            const y = ringThickness;
            const z = Math.sin(angle) * ringRadius;
            
            // 绕X轴旋转实现倾斜（像真正的土星环）
            ringPos[i * 3] = x;
            ringPos[i * 3 + 1] = y * cosTilt - z * sinTilt;
            ringPos[i * 3 + 2] = y * sinTilt + z * cosTilt;
          }
          
          tempPositions = new Float32Array(count * 3);
          tempPositions.set(spherePos);
          tempPositions.set(ringPos, spherePos.length);
          break;
        }
        case 'HEART': {
          // 真正的3D心形 - 使用参数方程
          tempPositions = new Float32Array(count * 3);
          const scale = 0.35;
          
          for (let i = 0; i < count; i++) {
            // 心形参数方程
            const u = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI;
            // 随机半径让粒子分布在表面和内部
            const rFactor = 0.7 + Math.random() * 0.3;
            
            // 3D心形参数方程
            const sinU = Math.sin(u);
            const cosU = Math.cos(u);
            const sinV = Math.sin(v);
            const cosV = Math.cos(v);
            
            // 改进的心形公式
            const x = 16 * Math.pow(sinU, 3) * sinV;
            const y = 13 * cosU - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
            const z = 16 * Math.pow(sinU, 3) * cosV * 0.5; // Z方向厚度
            
            tempPositions[i * 3] = x * scale * rFactor;
            tempPositions[i * 3 + 1] = y * scale * rFactor;
            tempPositions[i * 3 + 2] = z * scale * rFactor;
          }
          break;
        }
        case 'ROCKET': {
           // 优化的火箭：流线型机身 + 更好的尾翼和火焰
           tempPositions = new Float32Array(count * 3);
           
           const bodyCount = Math.floor(count * 0.45);
           const noseCount = Math.floor(count * 0.15);
           const finCount = Math.floor(count * 0.18);
           const flameCount = count - bodyCount - noseCount - finCount;
           
           let idx = 0;
           
           // 机身 - 圆柱体体积采样
           const bodyRadius = 1.0;
           const bodyHeight = 5.0;
           for (let i = 0; i < bodyCount; i++) {
             const angle = Math.random() * Math.PI * 2;
             const r = bodyRadius * Math.sqrt(0.8 + Math.random() * 0.2); // 表面为主
             const h = (Math.random() - 0.5) * bodyHeight;
             tempPositions[idx++] = Math.cos(angle) * r;
             tempPositions[idx++] = h;
             tempPositions[idx++] = Math.sin(angle) * r;
           }
           
           // 头锥 - 使用抛物面
           for (let i = 0; i < noseCount; i++) {
             const t = Math.random(); // 0到1，从尖端到底部
             const angle = Math.random() * Math.PI * 2;
             const r = t * bodyRadius; // 半径随高度增加
             const h = 2.5 + (1 - t) * 3.0; // 头锥高度
             tempPositions[idx++] = Math.cos(angle) * r * (0.9 + Math.random() * 0.1);
             tempPositions[idx++] = h;
             tempPositions[idx++] = Math.sin(angle) * r * (0.9 + Math.random() * 0.1);
           }
           
           // 尾翼 - 4个三角形翼
           const finPerWing = Math.floor(finCount / 4);
           for (let f = 0; f < 4; f++) {
             const baseAngle = (f / 4) * Math.PI * 2;
             for (let i = 0; i < finPerWing; i++) {
               const t = Math.random();
               const s = Math.random();
               // 三角形翼的形状
               const finX = (1 - t) * 0.2 + t * 1.8; // 从机身向外延伸
               const finY = -2.5 + s * 2.0 * (1 - t * 0.7); // 高度
               const thickness = (Math.random() - 0.5) * 0.15;
               
               tempPositions[idx++] = Math.cos(baseAngle) * finX + Math.cos(baseAngle + Math.PI/2) * thickness;
               tempPositions[idx++] = finY;
               tempPositions[idx++] = Math.sin(baseAngle) * finX + Math.sin(baseAngle + Math.PI/2) * thickness;
             }
           }
           
           // 火焰 - 动态锥形
           for (let i = 0; i < flameCount; i++) {
             const t = Math.random();
             const angle = Math.random() * Math.PI * 2;
             // 火焰从粗到细，带抖动
             const flameRadius = (1 - t * 0.7) * 0.9 + (Math.random() - 0.5) * 0.4;
             const flameY = -2.5 - t * 4.5; // 火焰向下延伸
             tempPositions[idx++] = Math.cos(angle) * flameRadius;
             tempPositions[idx++] = flameY;
             tempPositions[idx++] = Math.sin(angle) * flameRadius;
           }
           break;
        }
        case 'MOBIUS': {
           // 更漂亮的莫比乌斯环/扭结
           tempPositions = new Float32Array(count * 3);
           const scale = 3.0;
           
           for (let i = 0; i < count; i++) {
             const u = Math.random() * Math.PI * 2;
             const v = Math.random() * Math.PI * 2;
             
             // 环面扭结参数 (p,q) = (2,3) 产生漂亮的三叶结
             const p = 2, q = 3;
             const r = 0.5; // 管道半径
             
             // 环面扭结方程
             const R = 2 + Math.cos(q * u);
             const x = R * Math.cos(p * u);
             const y = R * Math.sin(p * u);
             const z = -Math.sin(q * u);
             
             // 添加管道厚度
             const tubeR = r * (0.6 + Math.random() * 0.4);
             const nx = Math.cos(v) * Math.cos(p * u) - Math.sin(q * u) * Math.sin(v) * Math.sin(p * u);
             const ny = Math.cos(v) * Math.sin(p * u) + Math.sin(q * u) * Math.sin(v) * Math.cos(p * u);
             const nz = Math.sin(v) * Math.cos(q * u);
             
             tempPositions[i * 3] = (x + nx * tubeR) * scale;
             tempPositions[i * 3 + 1] = (y + ny * tubeR) * scale;
             tempPositions[i * 3 + 2] = (z + nz * tubeR) * scale;
           }
           break;
        }
        case '36':
        default: {
           // Font load is async, handle with promise or callback
           const loader = new FontLoader();
           await new Promise<void>((resolve) => {
             loader.load('https://threejs.org/examples/fonts/helvetiker_bold.typeface.json', (font) => {
                const shapes = font.generateShapes('36', 10);
                const shapeGeo = new THREE.ShapeGeometry(shapes);
                shapeGeo.computeBoundingBox();
                const xMid = - 0.5 * ( shapeGeo.boundingBox!.max.x - shapeGeo.boundingBox!.min.x );
                const yMid = - 0.5 * ( shapeGeo.boundingBox!.max.y - shapeGeo.boundingBox!.min.y );
                shapeGeo.translate( xMid, yMid, 0 );
                
                const sampler = new MeshSurfaceSampler(new THREE.Mesh(shapeGeo)).build();
                tempPositions = new Float32Array(count * 3);
                const temp = new THREE.Vector3();
                for(let i=0; i<count; i++) {
                   sampler.sample(temp);
                   tempPositions[i*3] = temp.x;
                   tempPositions[i*3+1] = temp.y;
                   tempPositions[i*3+2] = (Math.random() - 0.5) * 4.0; 
                }
                resolve();
             });
           });
           break;
        }
      }

      // --- MORPH UPDATE LOGIC ---
      // 1. Copy current 'Target' to 'Position' (Current becomes Start)
      // Note: On first run, aTarget is empty (0,0,0). That's fine, particles will fly in from center.
      // But better: if it's the *very first* load, we might want to fill both.
      // Since we use the same buffer, we need to read from the GPU buffer? No, we maintain CPU side copies implicitly via state?
      // Actually, we can just read the 'aTarget' array from the geometry.
      
      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const targetAttr = geometry.attributes.aTarget as THREE.BufferAttribute;
      
      // If we have previously morphed, the visible state is at 'aTarget'.
      // So we copy 'aTarget' data into 'position'.
      if (posAttr && targetAttr) {
        // We can just swap the typed arrays, but we need to notify Three.js
        // Copy target -> position
        posAttr.array.set(targetAttr.array);
        posAttr.needsUpdate = true;
        
        // Update target with NEW positions
        if (tempPositions!) {
             targetAttr.array.set(tempPositions);
             targetAttr.needsUpdate = true;
        }
      }

      // Reset morph progress
      morphProgress.current = 0.0;
      isMorphing.current = true;
    };

    generateNewPositions();
  }, [currentShape, count, geometry]);

  // Animation Loop
  useFrame((state, delta) => {
    if (!materialRef.current || !pointsRef.current) return;

    // --- Morph Animation ---
    if (isMorphing.current) {
      morphProgress.current += delta * 1.5; // Morph speed
      if (morphProgress.current >= 1.0) {
        morphProgress.current = 1.0;
        isMorphing.current = false;
      }
      materialRef.current.uniforms.uMorph.value = morphProgress.current;
    }

    // --- Gesture Logic Smoothing ---
    // (Existing logic maintained)
    let desiredExplode = 0;
    let desiredGather = 0;

    if (handInteraction.isActive) {
      const intensity = 0.5 + (handInteraction.handDistance * 0.5); 
      if (handInteraction.gesture === 'OPEN') desiredExplode = 1.0 * intensity;
      else if (handInteraction.gesture === 'FIST') desiredGather = 1.0 * intensity;

      const targetRotY = (handInteraction.handPosition.x - 0.5) * Math.PI * 1.5; 
      const targetRotX = (handInteraction.handPosition.y - 0.5) * Math.PI * 0.5;
      pointsRef.current.rotation.y = THREE.MathUtils.lerp(pointsRef.current.rotation.y, targetRotY, delta * 5.0);
      pointsRef.current.rotation.x = THREE.MathUtils.lerp(pointsRef.current.rotation.x, targetRotX, delta * 5.0);
    } else {
      pointsRef.current.rotation.y += delta * 0.2; 
      pointsRef.current.rotation.x = THREE.MathUtils.lerp(pointsRef.current.rotation.x, 0, delta * 2.0);
    }

    // Update Uniforms
    const mat = materialRef.current;
    mat.uniforms.uTime.value = state.clock.getElapsedTime();
    mat.uniforms.uFlowSpeed.value = flowSpeed;
    mat.uniforms.uInteractionRadius.value = interactionRadius;
    mat.uniforms.uSizeMultiplier.value = particleSize;
    mat.uniforms.uModelScale.value = modelScale;
    mat.uniforms.uColorA.value.set(colorA);
    mat.uniforms.uColorB.value.set(colorB);
    
    // Smooth Explode/Gather
    mat.uniforms.uExplode.value = THREE.MathUtils.lerp(mat.uniforms.uExplode.value, desiredExplode, delta * 3.0);
    mat.uniforms.uGather.value = THREE.MathUtils.lerp(mat.uniforms.uGather.value, desiredGather, delta * 3.0);

    // 复用预分配的 Vector3 对象
    tempVec.set(state.mouse.x, state.mouse.y, 0.5);
    tempVec.unproject(camera);
    tempDir.copy(tempVec).sub(camera.position).normalize();
    const distance = -camera.position.z / tempDir.z;
    tempPos.copy(camera.position).add(tempDir.multiplyScalar(distance));
    mat.uniforms.uMouse.value.lerp(tempPos, 0.1);
  });

  if (!geometry) return null;

  return (
    <points ref={pointsRef} geometry={geometry}>
      <particleMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uPixelRatio={Math.min(window.devicePixelRatio, 2)}
      />
    </points>
  );
};
