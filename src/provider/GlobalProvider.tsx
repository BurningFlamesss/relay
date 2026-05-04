import { TooltipProvider } from '#/components/ui/tooltip'
import React from 'react'

function GlobalProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            <TooltipProvider>
                {children}
            </TooltipProvider>
        </>
    )
}

export default GlobalProvider