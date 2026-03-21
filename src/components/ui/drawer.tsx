"use client"

import * as React from "react"
import { Drawer as Vaul } from "vaul"

import { cn } from "@/lib/utils"

function Drawer(props: React.ComponentProps<typeof Vaul.Root>) {
  return (
    <Vaul.Root data-slot="drawer" shouldScaleBackground={false} {...props} />
  )
}

function DrawerTrigger(props: React.ComponentProps<typeof Vaul.Trigger>) {
  return <Vaul.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal(props: React.ComponentProps<typeof Vaul.Portal>) {
  return <Vaul.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose(props: React.ComponentProps<typeof Vaul.Close>) {
  return <Vaul.Close data-slot="drawer-close" {...props} />
}

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof Vaul.Overlay>,
  React.ComponentPropsWithoutRef<typeof Vaul.Overlay>
>(({ className, ...props }, ref) => (
  <Vaul.Overlay
    ref={ref}
    data-slot="drawer-overlay"
    className={cn("fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs", className)}
    {...props}
  />
))
DrawerOverlay.displayName = "DrawerOverlay"

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof Vaul.Content>,
  React.ComponentPropsWithoutRef<typeof Vaul.Content>
>(({ className, children, ...props }, ref) => (
  <Vaul.Portal>
    <DrawerOverlay />
    <Vaul.Content
      ref={ref}
      data-slot="drawer-content"
      className={cn(
        "fixed z-50 flex flex-col bg-background text-sm ring-1 ring-foreground/10 outline-none",
        className
      )}
      {...props}
    >
      {children}
    </Vaul.Content>
  </Vaul.Portal>
))
DrawerContent.displayName = "DrawerContent"

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-1 border-b border-border p-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto border-t border-border p-4", className)}
      {...props}
    />
  )
}

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof Vaul.Title>,
  React.ComponentPropsWithoutRef<typeof Vaul.Title>
>(({ className, ...props }, ref) => (
  <Vaul.Title
    ref={ref}
    data-slot="drawer-title"
    className={cn("font-heading text-base font-medium leading-none", className)}
    {...props}
  />
))
DrawerTitle.displayName = "DrawerTitle"

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof Vaul.Description>,
  React.ComponentPropsWithoutRef<typeof Vaul.Description>
>(({ className, ...props }, ref) => (
  <Vaul.Description
    ref={ref}
    data-slot="drawer-description"
    className={cn("text-muted-foreground text-sm", className)}
    {...props}
  />
))
DrawerDescription.displayName = "DrawerDescription"

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
