
export type GestureType = 'NONE' | 'FIST' | 'OPEN';

export type ShapeType = '36' | 'PYRAMID' | 'CUBE' | 'PLANET' | 'ROCKET' | 'MOBIUS' | 'HEART';

export interface HandInteractionState {
  isActive: boolean;
  gesture: GestureType;
  handDistance: number; // 0 (far) to 1 (near)
  pinchStrength: number; // 0 to 1
  handPosition: { x: number, y: number }; // x: 0..1, y: 0..1
}

export interface UIState {
  particleCount: number;
  particleSize: number;
  flowSpeed: number;
  interactionRadius: number;
  bloomStrength: number;
  colorA: string;
  colorB: string;
  handInteraction: HandInteractionState;
  modelScale: number;
  currentShape: ShapeType;
}

export type UIAction = 
  | { type: 'SET_FLOW_SPEED'; payload: number }
  | { type: 'SET_INTERACTION_RADIUS'; payload: number }
  | { type: 'SET_BLOOM_STRENGTH'; payload: number }
  | { type: 'SET_PARTICLE_SIZE'; payload: number }
  | { type: 'SET_MODEL_SCALE'; payload: number }
  | { type: 'SET_COLORS'; payload: { a: string, b: string } }
  | { type: 'UPDATE_HAND_STATE'; payload: Partial<HandInteractionState> }
  | { type: 'SET_SHAPE'; payload: ShapeType };
