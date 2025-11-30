
import React from 'react';
import { UIState, UIAction } from '../types';

interface UIControlsProps {
  state: UIState;
  dispatch: React.Dispatch<UIAction>;
}

export const UIControls: React.FC<UIControlsProps> = ({ state, dispatch }) => {
  return (
    <div className="absolute top-0 right-0 p-6 w-full max-w-sm z-10 pointer-events-none">
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 pointer-events-auto shadow-2xl transition-all hover:bg-black/50">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2">
          Particle 36
        </h1>
        <p className="text-gray-400 text-xs mb-6 font-mono tracking-wide flex justify-between">
          <span>INTERACTIVE VOXEL CLOUD</span>
          <span className={state.handInteraction.isActive ? "text-green-400" : "text-gray-600"}>
            {state.handInteraction.isActive ? "VISION ONLINE" : "VISION STANDBY"}
          </span>
        </p>

        <div className="space-y-5">
           {/* Current Shape Indicator */}
           <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-center">
              <label className="text-[10px] text-gray-400 font-bold tracking-widest block mb-1">CURRENT FORM</label>
              <div className="text-xl font-black text-white tracking-widest">{state.currentShape}</div>
              <div className="text-[9px] text-gray-500 mt-1">CLENCH FIST THEN RELEASE TO MORPH</div>
           </div>

          {/* Model Scale - Replaced Interaction Radius */}
          <div className="group">
            <div className="flex justify-between mb-1">
              <label className="text-white text-xs font-semibold tracking-wider">NUMBER SCALE</label>
              <span className="text-purple-400 text-xs font-mono">{state.modelScale.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={state.modelScale}
              onChange={(e) => dispatch({ type: 'SET_MODEL_SCALE', payload: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>

          {/* Particle Size */}
          <div className="group">
            <div className="flex justify-between mb-1">
              <label className="text-white text-xs font-semibold tracking-wider">PARTICLE SIZE</label>
              <span className="text-emerald-400 text-xs font-mono">{state.particleSize.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={state.particleSize}
              onChange={(e) => dispatch({ type: 'SET_PARTICLE_SIZE', payload: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Flow Speed */}
          <div className="group">
            <div className="flex justify-between mb-1">
              <label className="text-white text-xs font-semibold tracking-wider">FLOW TURBULENCE</label>
              <span className="text-cyan-400 text-xs font-mono">{state.flowSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={state.flowSpeed}
              onChange={(e) => dispatch({ type: 'SET_FLOW_SPEED', payload: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Bloom */}
          <div className="group">
            <div className="flex justify-between mb-1">
              <label className="text-white text-xs font-semibold tracking-wider">OPTICAL BLOOM</label>
              <span className="text-pink-400 text-xs font-mono">{state.bloomStrength.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={state.bloomStrength}
              onChange={(e) => dispatch({ type: 'SET_BLOOM_STRENGTH', payload: parseFloat(e.target.value) })}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
          </div>
          
           <div className="pt-4 border-t border-white/10 space-y-2">
              <p className="text-[10px] text-gray-500 font-mono">
                MOUSE: HOVER / DRAG TO ROTATE
              </p>
              <p className="text-[10px] text-gray-500 font-mono">
                GESTURE: OPEN PALM = EXPLODE / FIST = GATHER
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};
