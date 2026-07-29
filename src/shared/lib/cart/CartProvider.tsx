"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { getProductById } from "@/shared/config/products";
import {
  cartItemCount,
  cartReducer,
  initialCartState,
  type CartAction,
  type CartState,
} from "@/shared/lib/cart/cartReducer";

type CartContextValue = {
  state: CartState;
  dispatch: React.Dispatch<CartAction>;
  itemCount: number;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  const value = useMemo(() => {
    const subtotal = state.lines.reduce((sum, line) => {
      const product = getProductById(line.productId);
      return sum + (product?.price != null ? product.price : 0) * line.quantity;
    }, 0);
    return {
      state,
      dispatch,
      itemCount: cartItemCount(state),
      subtotal,
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
