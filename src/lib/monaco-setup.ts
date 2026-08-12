import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { jsonDefaults } from 'monaco-editor/language/json/monaco.contribution.js'

loader.config({ monaco })

jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    schemas: [],
})
