import React, { useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Globe from './components/Globe';
import { MapType } from './types';

// Component to auto-adjust camera distance based on screen aspect ratio
const AutoFitCamera = () => {
  const { camera, size } = useThree();

  useEffect(() => {
    const aspect = size.width / size.height;
    // Globe radius is 2, Atmosphere is 2.2.
    // We want to fit ~5.5 units (diameter + padding) into the view.
    const targetDiameter = 5.5;
    
    // Vertical FOV in radians (45 degrees)
    const vFov = (45 * Math.PI) / 180;
    
    // Distance required to fit vertically (Standard Landscape)
    const distVertical = targetDiameter / (2 * Math.tan(vFov / 2));
    
    // Distance required to fit horizontally (Critical for Mobile Portrait)
    // Visible Width = Visible Height * Aspect
    const distHorizontal = targetDiameter / (2 * Math.tan(vFov / 2) * aspect);
    
    // Choose the distance that accommodates both dimensions
    // On mobile (aspect < 1), distHorizontal will be larger, pushing the camera back.
    const finalDist = Math.max(distVertical, distHorizontal);
    
    camera.position.z = Math.max(finalDist, 5); // Ensure we don't go too close
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
};

const App: React.FC = () => {
  const [mapType, setMapType] = useState<MapType>(MapType.SAT);
  const [progress, setProgress] = useState(0);
  const [rotationSpeed, setRotationSpeed] = useState(0.05);

  return (
    <div className="relative w-full h-full bg-black">
      {/* 3D Scene */}
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <AutoFitCamera />
        <Globe 
          mapType={mapType} 
          onProgress={setProgress}
          rotationSpeed={rotationSpeed}
        />
        <OrbitControls enablePan={false} minDistance={3} maxDistance={20} />
      </Canvas>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-4 md:p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
          <div>
            <h1 className="text-white text-xl md:text-2xl font-bold tracking-wider">YANDEX EARTH</h1>
            <p className="text-gray-400 text-xs md:text-sm mt-1">Live Tile Streaming</p>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <div className="flex gap-2">
              <button 
                onClick={() => setMapType(MapType.SAT)}
                className={`px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold uppercase border transition-colors ${
                  mapType === MapType.SAT 
                    ? 'bg-red-600 border-red-600 text-white' 
                    : 'bg-transparent border-gray-600 text-gray-400 hover:border-white'
                }`}
              >
                Satellite
              </button>
              <button 
                onClick={() => setMapType(MapType.MAP)}
                className={`px-2 md:px-3 py-1 text-[10px] md:text-xs font-bold uppercase border transition-colors ${
                  mapType === MapType.MAP 
                    ? 'bg-yellow-500 border-yellow-500 text-black' 
                    : 'bg-transparent border-gray-600 text-gray-400 hover:border-white'
                }`}
              >
                Map
              </button>
            </div>

            {/* Rotation Speed Control */}
            <div className="flex flex-col items-end w-36 bg-black/40 backdrop-blur-md p-2 rounded border border-white/10">
               <div className="flex justify-between w-full mb-1.5">
                  <span className="text-[9px] text-gray-300 font-mono uppercase tracking-wider">Rotation</span>
                  <span className="text-[9px] text-red-400 font-mono font-bold">{rotationSpeed.toFixed(2)}</span>
               </div>
               <input 
                 type="range" 
                 min="0" 
                 max="0.5" 
                 step="0.01" 
                 value={rotationSpeed} 
                 onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                 className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-red-600"
               />
            </div>
          </div>
        </div>

        {/* Streaming Indicator */}
        <div className="absolute top-28 right-4 md:right-6 pointer-events-none text-right">
           <div className="flex items-center justify-end gap-2 mb-1">
             <div className={`w-2 h-2 rounded-full ${progress < 100 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
             <span className="text-xs font-mono text-gray-400">
               {progress < 100 ? 'STREAMING' : 'READY'}
             </span>
           </div>
           <div className="w-24 md:w-32 h-1 bg-gray-800 rounded-full ml-auto">
             <div 
               className="h-full bg-red-600 rounded-full transition-all duration-300" 
               style={{ width: `${progress}%` }}
             ></div>
           </div>
           <span className="text-[10px] text-gray-500 font-mono block mt-1">High-Res: {progress}%</span>
        </div>

        {/* Footer / Attribution */}
        <div className="flex justify-between items-end pointer-events-auto">
           {/* Yandex Logo Representation */}
           <div className="bg-white/10 backdrop-blur-md p-2 md:p-3 rounded-lg border border-white/10">
              <a href="https://yandex.com/maps" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3">
                <div className="w-6 h-6 md:w-8 md:h-8 bg-red-600 rounded flex items-center justify-center text-white font-bold text-lg md:text-xl">
                  Y
                </div>
                <div className="flex flex-col">
                  <span className="text-white text-[10px] md:text-xs font-bold leading-none group-hover:text-red-500 transition-colors">Yandex Maps</span>
                  <span className="text-gray-400 text-[9px] md:text-[10px] leading-none mt-1">Static API Data</span>
                </div>
              </a>
           </div>

           <div className="text-right hidden sm:block">
             <div className="text-gray-500 text-[10px] font-mono">
               PROJECTION: MERCATOR &rarr; SPHERE
             </div>
             <div className="text-gray-500 text-[10px] font-mono mt-1">
               DYNAMIC LOD: ZOOM 2 &rarr; 3
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;