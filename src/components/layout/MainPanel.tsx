import { useRef } from 'react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import RequestBuilder from '../request/RequestBuilder'
import ResponsePanel from '../response/ResponsePanel'
import RequestTabBar from './RequestTabBar'

export default function MainPanel() {
    const responsePanelRef = useRef<PanelImperativeHandle>(null)

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
            <RequestTabBar />
            <ResizablePanelGroup orientation="vertical">
                <ResizablePanel defaultSize={50} minSize={25}>
                    <RequestBuilder />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                    panelRef={responsePanelRef}
                    id="response"
                    defaultSize={50}
                    minSize={20}
                    collapsible
                    collapsedSize="2.75rem"
                    className="flex min-h-0 flex-col"
                >
                    <ResponsePanel responsePanelRef={responsePanelRef} />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
