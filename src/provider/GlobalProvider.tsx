import { Toaster } from '#/components/ui/sonner.tsx';
import { TooltipProvider } from '#/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react'

const queryClient = new QueryClient({
    
})

function GlobalProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            <QueryClientProvider client={queryClient}>
                <TooltipProvider>
                    {children}
                    <Toaster />
                </TooltipProvider>
            </QueryClientProvider>
        </>
    )
}

export default GlobalProvider