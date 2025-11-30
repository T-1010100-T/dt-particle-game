
import React, { useReducer, useCallback, useRef, useEffect } from 'react';
import { Scene } from './components/Scene';
import { UIControls } from './components/UIControls';
import { HandTracker } from './components/HandTracker';
import { UIState, UIAction, HandInteractionState, ShapeType, GestureType } from './types';

const initialState: UIState = {
  particleCount: 30000,  // 降低粒子数量以提升性能
  particleSize: 1.5,     // 稍微增大粒子大小补偿视觉效果
  flowSpeed: 0.5,
  interactionRadius: 1.5,
  bloomStrength: 1.8,
  colorA: '#00ccff', 
  colorB: '#7700ff',
  modelScale: 1.0,
  currentShape: '36',
  handInteraction: {
    isActive: false,
    gesture: 'NONE',
    handDistance: 0,
    pinchStrength: 0,
    handPosition: { x: 0.5, y: 0.5 }
  }
};

function reducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_FLOW_SPEED':
      return { ...state, flowSpeed: action.payload };
    case 'SET_INTERACTION_RADIUS':
      return { ...state, interactionRadius: action.payload };
    case 'SET_BLOOM_STRENGTH':
      return { ...state, bloomStrength: action.payload };
    case 'SET_PARTICLE_SIZE':
      return { ...state, particleSize: action.payload };
    case 'SET_MODEL_SCALE':
      return { ...state, modelScale: action.payload };
    case 'SET_COLORS':
      return { ...state, colorA: action.payload.a, colorB: action.payload.b };
    case 'UPDATE_HAND_STATE':
      return { 
        ...state, 
        handInteraction: { ...state.handInteraction, ...action.payload } 
      };
    case 'SET_SHAPE':
      return { ...state, currentShape: action.payload };
    default:
      return state;
  }
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const lastGestureRef = useRef<GestureType>('NONE');

  const handleHandUpdate = useCallback((handState: Partial<HandInteractionState>) => {
    dispatch({ type: 'UPDATE_HAND_STATE', payload: handState });
  }, []);

  // Gesture Transition Logic for Shape Switching
  useEffect(() => {
    const currentGesture = state.handInteraction.gesture;
    const lastGesture = lastGestureRef.current;

    // Trigger on RELEASE (FIST -> OPEN or FIST -> NONE)
    // This feels natural: you crush the object (Fist), then release to reveal a new form.
    if (lastGesture === 'FIST' && (currentGesture === 'OPEN' || currentGesture === 'NONE')) {
      const shapes: ShapeType[] = ['36', 'PYRAMID', 'CUBE', 'PLANET', 'ROCKET', 'MOBIUS', 'HEART'];
      // Filter out current shape to ensure a change happens
      const availableShapes = shapes.filter(s => s !== state.currentShape);
      const randomShape = availableShapes[Math.floor(Math.random() * availableShapes.length)];
      
      console.log("Gesture Release Detected! Switching to:", randomShape);
      dispatch({ type: 'SET_SHAPE', payload: randomShape });
    }

    lastGestureRef.current = currentGesture;
  }, [state.handInteraction.gesture, state.currentShape]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <UIControls state={state} dispatch={dispatch} />
      
      <Scene uiState={state} />
      
      <HandTracker onUpdate={handleHandUpdate} />
      
      <div className="absolute bottom-6 left-6 pointer-events-none space-y-2">
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
            <span className="text-[10px] text-cyan-500/80 font-mono tracking-widest uppercase">
              Voxel Engine Active • {state.particleCount.toLocaleString()} particles
            </span>
         </div>
         {state.handInteraction.isActive && (
           <div className="flex flex-col gap-1 pl-4 border-l border-cyan-500/30">
             <span className="text-[10px] text-white/60 font-mono uppercase">
               GESTURE: <span className="text-cyan-400 font-bold">{state.handInteraction.gesture}</span>
             </span>
              <span className="text-[10px] text-white/60 font-mono uppercase">
               DEPTH: <span className="text-purple-400 font-bold">{(state.handInteraction.handDistance * 100).toFixed(0)}%</span>
             </span>
             <span className="text-[10px] text-white/60 font-mono uppercase">
               SHAPE: <span className="text-yellow-400 font-bold">{state.currentShape}</span>
             </span>
           </div>
         )}
         {!state.handInteraction.isActive && (
            <div className="flex flex-col gap-1 pl-4 border-l border-gray-700">
              <span className="text-[10px] text-gray-500 font-mono uppercase">
               AUTO-ROTATION: <span className="text-gray-400">ACTIVE</span>
             </span>
            </div>
         )}
      </div>
    </div>
  );
};

export default App;
