import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { TileManager } from '../services/yandexMapService';
import { MapType } from '../types';

interface GlobeProps {
  mapType: MapType;
  onProgress?: (progress: number) => void;
}

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vNormal;

  const float PI = 3.14159265359;
  const float MAX_LAT = 85.05112878;
  const float RAD_PER_DEG = PI / 180.0;

  float latToMercator(float latRad) {
    float y = log(tan(PI / 4.0 + latRad / 2.0));
    // Map Latitude to Texture V.
    // +0.5 means North (Positive Y in Mercator) maps to V=1 (Top of texture)
    return 0.5 + 0.5 * (y / PI);
  }

  void main() {
    // vUv.y=0 is South Pole, vUv.y=1 is North Pole
    float lat = (vUv.y - 0.5) * PI;

    float maxLatRad = MAX_LAT * RAD_PER_DEG;
    vec3 color = vec3(0.0, 0.05, 0.1); // Default deep blue ocean

    if (lat <= maxLatRad && lat >= -maxLatRad) {
      float mercV = latToMercator(lat);
      // Clamp V to prevent wrapping artifacts at the very edge
      mercV = clamp(mercV, 0.001, 0.999);
      vec4 texColor = texture2D(map, vec2(vUv.x, mercV));
      color = texColor.rgb;
    }

    // Rim lighting on the ground
    float viewDot = dot(vNormal, vec3(0.0, 0.0, 1.0));
    float rim = 1.0 - clamp(viewDot, 0.0, 1.0);
    color += vec3(0.2, 0.3, 0.5) * pow(rim, 4.0);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 4.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 1.5;
  }
`;

const Globe: React.FC<GlobeProps> = ({ mapType, onProgress }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const managerRef = useRef<TileManager | null>(null);
  
  // Create uniform object once
  const uniforms = useMemo(() => ({
    map: { value: new THREE.Texture() }
  }), []);

  // Initialize Tile Manager and Texture
  useEffect(() => {
    // Callback when texture updates
    const handleUpdate = () => {
      if (uniforms.map.value) {
        uniforms.map.value.needsUpdate = true;
      }
      if (managerRef.current && onProgress) {
        onProgress(managerRef.current.getProgress());
      }
    };

    const manager = new TileManager(mapType, handleUpdate);
    managerRef.current = manager;

    // Load base layer
    manager.loadBaseLayer();

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(manager.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true; // Default is true, ensures North is at V=1

    // Assign to uniform
    uniforms.map.value = texture;

    return () => {
      manager.destroy();
      texture.dispose();
    };
  }, [mapType, uniforms]);

  // Animation Loop
  useFrame((state, delta) => {
    if (meshRef.current) {
      // Rotation
      meshRef.current.rotation.y += delta * 0.05;
      
      // Calculate current longitude facing the camera
      const rotY = meshRef.current.rotation.y;
      const rad = rotY % (2 * Math.PI);
      const deg = (rad * 180) / Math.PI;
      const currentLon = -deg; 

      if (managerRef.current) {
        managerRef.current.update(currentLon);
      }
    }
  });

  return (
    <group>
      <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {/* Earth Sphere */}
      <Sphere ref={meshRef} args={[2, 64, 64]}>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={false} // Opaque earth
        />
      </Sphere>
      
      {/* Atmospheric Glow Sphere */}
      <Sphere args={[2.2, 64, 64]}>
         <shaderMaterial
           vertexShader={atmosphereVertexShader}
           fragmentShader={atmosphereFragmentShader}
           blending={THREE.AdditiveBlending}
           side={THREE.BackSide}
           transparent
           depthWrite={false}
         />
      </Sphere>
    </group>
  );
};

export default Globe;