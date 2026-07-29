export type CartLine = {
  productId: string;
  quantity: number;
};

export type CartState = {
  lines: CartLine[];
  isOpen: boolean;
};

export type CartAction =
  | { type: "ADD"; productId: string; quantity?: number }
  | { type: "REMOVE"; productId: string }
  | { type: "SET_QTY"; productId: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "TOGGLE" };

export const initialCartState: CartState = {
  lines: [],
  isOpen: false,
};

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const quantity = action.quantity ?? 1;
      const existing = state.lines.find((line) => line.productId === action.productId);
      if (existing) {
        return {
          ...state,
          isOpen: true,
          lines: state.lines.map((line) =>
            line.productId === action.productId
              ? { ...line, quantity: line.quantity + quantity }
              : line,
          ),
        };
      }
      return {
        ...state,
        isOpen: true,
        lines: [...state.lines, { productId: action.productId, quantity }],
      };
    }
    case "REMOVE":
      return {
        ...state,
        lines: state.lines.filter((line) => line.productId !== action.productId),
      };
    case "SET_QTY": {
      if (action.quantity <= 0) {
        return {
          ...state,
          lines: state.lines.filter((line) => line.productId !== action.productId),
        };
      }
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.productId === action.productId
            ? { ...line, quantity: action.quantity }
            : line,
        ),
      };
    }
    case "CLEAR":
      return { ...state, lines: [], isOpen: false };
    case "OPEN":
      return { ...state, isOpen: true };
    case "CLOSE":
      return { ...state, isOpen: false };
    case "TOGGLE":
      return { ...state, isOpen: !state.isOpen };
    default:
      return state;
  }
}

export function cartItemCount(state: CartState): number {
  return state.lines.reduce((sum, line) => sum + line.quantity, 0);
}
