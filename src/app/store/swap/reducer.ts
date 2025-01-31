import BigNumber from "bignumber.js";
import { SwapActionTypes } from "./actions";
import { SwapFormState } from "./types";
import { TokenActionTypes } from "../token/actions";
import { TokenUpdateProps, TokenUpdateAllProps } from "../token/types";

const initial_state: SwapFormState = {
  slippage: 0.01, // percent
  expiry: 3, // blocks

  exactOf: "in",
  inAmount: new BigNumber(0),
  outAmount: new BigNumber(0),

  isInsufficientReserves: false,
  forNetwork: null,
}

const reducer = (state: SwapFormState = initial_state, action: any) => {
  const { payload } = action;

  switch (action.type) {

    case SwapActionTypes.CLEAR_FORM:
      return {
        exactOf: "in",
        inAmount: new BigNumber(0),
        outAmount: new BigNumber(0),

        isInsufficientReserves: false,
        forNetwork: null,
      };

    case SwapActionTypes.UPDATE:
      return { ...state, ...payload };

    case TokenActionTypes.TOKEN_UPDATE_ALL:
      const updateAllProps: TokenUpdateAllProps = payload;
      const tokenIn = updateAllProps[state.inToken?.address || ""]
      const tokenOut = updateAllProps[state.outToken?.address || ""]

      return {
        ...state,
        ...(tokenIn && tokenIn.address === state.inToken?.address) && {
          inToken: {
            ...state.inToken,
            ...tokenIn,
          }
        },
        ...(tokenOut && tokenOut.address === state.outToken?.address) && {
          outToken: {
            ...state.outToken,
            ...tokenOut,
          }
        },
      };

    case TokenActionTypes.TOKEN_UPDATE:
      const updateProps: TokenUpdateProps = payload;
      if (updateProps.address !== state.inToken?.address &&
        updateProps.address !== state.outToken?.address)
        return state;

      return {
        ...state,
        ...updateProps.address === state.inToken?.address && {
          inToken: {
            ...state.inToken,
            ...updateProps,
          }
        },
        ...updateProps.address === state.outToken?.address && {
          outToken: {
            ...state.outToken,
            ...updateProps,
          }
        },
      };

    default:
      return state;
  }
}

export default reducer;
