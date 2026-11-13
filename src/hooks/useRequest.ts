import { useAppStore } from '../store'
import { sendHttpRequest } from '../lib/send-http'

export function useRequest() {
    const { setResponse, setLoading } = useAppStore()

    const sendRequest = async () => {
        const activeRequest = useAppStore.getState().activeRequest
        setLoading(true)
        try {
            const result = await sendHttpRequest(activeRequest)
            setResponse(result.response)
        } finally {
            setLoading(false)
        }
    }

    return { sendRequest }
}
