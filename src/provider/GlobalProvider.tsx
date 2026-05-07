import { Toaster } from '#/components/ui/sonner.tsx';
import { TooltipProvider } from '#/components/ui/tooltip'
import React from 'react'

function GlobalProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            <TooltipProvider>
                {children}
                <Toaster />
            </TooltipProvider>
        </>
    )
}

export default GlobalProvider