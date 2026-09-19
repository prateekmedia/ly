import { configureStore } from '@reduxjs/toolkit'
import appReducer from '@/store/appSlice.js'

export const store = configureStore({
  reducer: {
    app: appReducer,
  },
})
