import { createContext, useContext } from 'react'

export const CollectionSelectionContext = createContext<string[]>([])

export function useCollectionFlatVisibleIds() {
    return useContext(CollectionSelectionContext)
}
