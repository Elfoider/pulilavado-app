"use client";
import React from "react";
import { SnackbarProvider } from "notistack";

interface SnackbarProviderWrapperProps {
  children: React.ReactNode;
}

export default function NotiStackWrapper({ children }: SnackbarProviderWrapperProps) {
  return (
    <SnackbarProvider maxSnack={3} autoHideDuration={3000}>
      {children}
    </SnackbarProvider>
  )
}
