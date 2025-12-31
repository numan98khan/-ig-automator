import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import AutomationsTabs from '../components/AutomationsTabs'
import {
  ArrowLeft,
  Plus,
  Save,
  RefreshCw,
  UploadCloud,
  Trash2,
  Play,
  LayoutGrid,
  Network,
  Copy,
  Eraser,
  Maximize2,
} from 'lucide-react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AI_MODEL_SUGGESTIONS,
  DEFAULT_TRIGGER_TYPE,
  FIELD_TYPES,
  FLOW_NODE_LABELS,
  FLOW_NODE_LIBRARY,
  FLOW_NODE_STYLES,
  GOAL_OPTIONS,
  INDUSTRY_OPTIONS,
  MESSAGE_STATE_VARIABLES,
  REASONING_EFFORT_OPTIONS,
  TRIGGER_LIBRARY,
  TRIGGER_METADATA,
} from './automation-templates/constants'
import { buildFlowNodeTypes } from './automation-templates/components/FlowNodes'
import type {
  DraftForm,
  FieldForm,
  FlowAiSettings,
  FlowDisplay,
  FlowDraft,
  FlowEdge,
  FlowField,
  FlowIntentSettings,
  FlowNode,
  FlowNodeType,
  FlowTemplate,
  FlowTrigger,
  FlowTriggerConfig,
  RouterCondition,
  RouterRule,
  RouterRuleOperator,
  RouterRuleSource,
  TriggerType,
} from './automation-templates/types'
import {
  buildEmptyDraftForm,
  buildFieldForm,
  buildFlowDsl,
  buildNodeData,
  buildTriggerForm,
  formatButtonList,
  formatJson,
  formatKeywordList,
  formatKnowledgeIds,
  formatTags,
  normalizeTriggerConfig,
  parseButtonList,
  parseDefaultValue,
  parseFlowDsl,
  parseKeywordList,
  parseKnowledgeIds,
  parseOptionalNumber,
  parseOptionsText,
  parseTags,
} from './automation-templates/utils'

const ROUTER_SOURCE_OPTIONS: Array<{ value: RouterRuleSource; label: string }> = [
  { value: 'vars', label: 'Vars (session)' },
  { value: 'message', label: 'Message text' },
  { value: 'config', label: 'User config' },
  { value: 'context', label: 'Message context' },
]

const ROUTER_OPERATOR_OPTIONS: Array<{ value: RouterRuleOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
]

const ROUTER_MESSAGE_OPERATORS: Array<{ value: RouterRuleOperator; label: string }> = [
  { value: 'keywords', label: 'Keywords' },
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
]

const ROUTER_DEFAULT_CONDITION: RouterCondition = {
  type: 'rules',
  op: 'all',
  rules: [],
}

const ROUTER_DEFAULT_RULE: RouterRule = {
  source: 'vars',
  path: 'detectedIntent',
  operator: 'equals',
  value: '',
}

export default function AutomationTemplates() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const builderOpen = searchParams.get('view') === 'builder'
  const builderDraftId = searchParams.get('draft')
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [draftForm, setDraftForm] = useState<DraftForm>(buildEmptyDraftForm())
  const [versionLabel, setVersionLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newDraftOpen, setNewDraftOpen] = useState(false)
  const [newDraftName, setNewDraftName] = useState('')
  const [newDraftDescription, setNewDraftDescription] = useState('')
  const [newDraftTemplateId, setNewDraftTemplateId] = useState('')
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const [startNodeId, setStartNodeId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [dslEditorText, setDslEditorText] = useState('')
  const [dslEditorDirty, setDslEditorDirty] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const syncingRef = useRef(false)

  const nodeTypes = useMemo<NodeTypes>(() => buildFlowNodeTypes(), [])

  const { data: draftData, isLoading } = useQuery({
    queryKey: ['flow-drafts'],
    queryFn: () => adminApi.getFlowDrafts(),
  })

  const { data: templateData } = useQuery({
    queryKey: ['flow-templates'],
    queryFn: () => adminApi.getFlowTemplates(),
  })

  const { data: intentData } = useQuery({
    queryKey: ['automation-intents'],
    queryFn: () => adminApi.getAutomationIntents(),
  })

  const drafts = useMemo(() => {
    const payload = unwrapData<any>(draftData)
    return Array.isArray(payload) ? (payload as FlowDraft[]) : []
  }, [draftData])

  const templates = useMemo(() => {
    const payload = unwrapData<any>(templateData)
    return Array.isArray(payload) ? (payload as FlowTemplate[]) : []
  }, [templateData])

  const intentOptions = useMemo(() => {
    const payload = unwrapData<any>(intentData)
    return Array.isArray(payload) ? payload : []
  }, [intentData])

  const templateMap = useMemo(() => {
    const map = new Map<string, FlowTemplate>()
    templates.forEach((template) => map.set(template._id, template))
    return map
  }, [templates])

  const selectedDraft = drafts.find((draft) => draft._id === selectedDraftId) || null
  const selectedNode = useMemo(
    () => flowNodes.find((node) => node.id === selectedNodeId) || null,
    [flowNodes, selectedNodeId],
  )
  const selectedTriggerConfig: FlowTriggerConfig = selectedNode?.triggerConfig || {}
  const flowStats = useMemo(
    () => ({ nodes: flowNodes.length, edges: flowEdges.length }),
    [flowNodes.length, flowEdges.length],
  )
  const routerEdges = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'router') return []
    const getOrder = (edge: FlowEdge) => {
      if (typeof edge.order === 'number') return edge.order
      const target = flowNodes.find((node) => node.id === edge.target)
      return typeof target?.position?.y === 'number' ? target.position.y : 0
    }
    return flowEdges
      .filter((edge) => edge.source === selectedNode.id)
      .slice()
      .sort((a, b) => getOrder(a) - getOrder(b))
  }, [flowEdges, flowNodes, selectedNode])
  const configFieldKeys = useMemo(
    () => draftForm.fields.map((field) => field.key).filter(Boolean),
    [draftForm.fields],
  )

  useEffect(() => {
    if (flowNodes.length === 0) return
    const nodeMap = new Map(flowNodes.map((node) => [node.id, node]))
    const routerIds = new Set(flowNodes.filter((node) => node.type === 'router').map((node) => node.id))

    const branchTags = new Map<string, string | undefined>()
    routerIds.forEach((routerId) => {
      const outgoing = flowEdges.filter((edge) => edge.source === routerId)
      const sorted = outgoing
        .map((edge, index) => ({ edge, index }))
        .sort((a, b) => {
          const aOrder = typeof a.edge.order === 'number'
            ? a.edge.order
            : (nodeMap.get(a.edge.target)?.position?.y ?? a.index)
          const bOrder = typeof b.edge.order === 'number'
            ? b.edge.order
            : (nodeMap.get(b.edge.target)?.position?.y ?? b.index)
          return aOrder - bOrder
        })
        .map((entry) => entry.edge)

      let routeIndex = 1
      sorted.forEach((edge) => {
        const condition = normalizeRouterCondition(edge.condition)
        const isDefault = condition.type === 'else'
        const sourceLabels: string[] = []
        const seenSources = new Set<string>()
        if (!isDefault) {
          (condition.rules || []).forEach((rule) => {
            const label = rule.source === 'vars'
              ? 'vars'
              : rule.source === 'message'
                ? 'message'
                : rule.source === 'config'
                  ? 'config'
                  : rule.source === 'context'
                    ? 'context'
                    : ''
            if (label && !seenSources.has(label)) {
              sourceLabels.push(label)
              seenSources.add(label)
            }
          })
        }
        const sourceText = sourceLabels.length > 0 ? sourceLabels.join(' + ') : 'rules'
        const tag = isDefault ? 'default' : `${routeIndex} | ${sourceText}`
        if (!isDefault) {
          routeIndex += 1
        }
        if (edge.target) {
          branchTags.set(edge.target, tag)
        }
      })
    })

    setFlowNodes((nodes) => {
      let changed = false
      const nextNodes = nodes.map((node) => {
        const branchTag = branchTags.get(node.id)
        if (node.data?.branchTag === branchTag) return node
        changed = true
        return {
          ...node,
          data: {
            ...node.data,
            branchTag,
          },
        }
      })
      return changed ? nextNodes : nodes
    })

    if (routerIds.size === 0) return
    setFlowEdges((edges) => {
      let changed = false
      const nextEdges = edges.map((edge) => {
        if (!routerIds.has(edge.source)) return edge
        if (edge.type !== 'router' && !edge.label) return edge
        changed = true
        return {
          ...edge,
          type: 'smoothstep',
          label: undefined,
        }
      })
      return changed ? nextEdges : edges
    })
  }, [flowEdges, flowNodes, setFlowEdges, setFlowNodes])
  const startNodeLabel = useMemo(() => {
    if (!startNodeId) return ''
    const node = flowNodes.find((item) => item.id === startNodeId)
    return node?.data.label || startNodeId
  }, [flowNodes, startNodeId])

  useEffect(() => {
    if (!selectedDraftId && drafts.length > 0) {
      setSelectedDraftId(drafts[0]._id)
    }
  }, [drafts, selectedDraftId])

  useEffect(() => {
    if (!builderDraftId || builderDraftId === selectedDraftId) return
    const exists = drafts.some((draft) => draft._id === builderDraftId)
    if (exists) {
      setSelectedDraftId(builderDraftId)
    }
  }, [builderDraftId, drafts, selectedDraftId])

  useEffect(() => {
    if (!builderOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [builderOpen])

  useEffect(() => {
    if (!builderOpen) {
      setPaletteOpen(false)
    }
  }, [builderOpen])

  useEffect(() => {
    if (!selectedDraft) return
    const { nodes, edges, startNodeId: parsedStart } = parseFlowDsl(selectedDraft.dsl || {})
    const hydratedNodes = nodes.map((node) => ({
      ...node,
      data: {
        ...buildNodeData(node),
        isStart: node.id === parsedStart,
      },
    }))
    setDraftForm({
      name: selectedDraft.name || '',
      description: selectedDraft.description || '',
      status: selectedDraft.status || 'draft',
      templateId: selectedDraft.templateId || '',
      dslText: formatJson(selectedDraft.dsl || {}),
      triggers: (selectedDraft.triggers || []).map((trigger) => buildTriggerForm(trigger)),
      fields: (selectedDraft.exposedFields || []).map((field) => buildFieldForm(field)),
      display: {
        outcome: selectedDraft.display?.outcome || '',
        goal: selectedDraft.display?.goal || '',
        industry: selectedDraft.display?.industry || '',
        setupTime: selectedDraft.display?.setupTime || '',
        collectsText: (selectedDraft.display?.collects || []).join(', '),
        icon: selectedDraft.display?.icon || '',
        previewText: formatJson(selectedDraft.display?.previewConversation || []),
      },
    })
    syncingRef.current = true
    setFlowNodes(hydratedNodes)
    setFlowEdges(edges)
    setStartNodeId(parsedStart)
    setSelectedNodeId(null)
    setDslEditorText(formatJson(selectedDraft.dsl || {}))
    setDslEditorDirty(false)
    setVersionLabel('')
    setError(null)
  }, [selectedDraft])

  useEffect(() => {
    if (!selectedDraft) return
    if (syncingRef.current) {
      syncingRef.current = false
      return
    }
    const dsl = buildFlowDsl(flowNodes, flowEdges, startNodeId)
    const nextText = formatJson(dsl)
    setDraftForm((prev) => ({ ...prev, dslText: nextText }))
    if (!dslEditorDirty) {
      setDslEditorText(nextText)
    }
  }, [flowNodes, flowEdges, startNodeId, selectedDraft, dslEditorDirty])

  useEffect(() => {
    if (!startNodeId) return
    setFlowNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isStart: node.id === startNodeId,
        },
      })),
    )
  }, [startNodeId, setFlowNodes])

  const createMutation = useMutation({
    mutationFn: (payload: any) => adminApi.createFlowDraft(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
      const created = unwrapData<any>(response)
      if (created?._id) {
        setSelectedDraftId(created._id)
      }
      setNewDraftName('')
      setNewDraftDescription('')
      setNewDraftTemplateId('')
      setNewDraftOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateFlowDraft(selectedDraftId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (payload: any) => adminApi.publishFlowDraft(selectedDraftId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
      queryClient.invalidateQueries({ queryKey: ['flow-templates'] })
      setVersionLabel('')
    },
  })

  const handleCreateDraft = () => {
    if (!newDraftName.trim()) {
      setError('Draft name is required.')
      return
    }
    setError(null)
    createMutation.mutate({
      name: newDraftName.trim(),
      description: newDraftDescription.trim(),
      templateId: newDraftTemplateId || undefined,
      dsl: { nodes: [], edges: [] },
    })
  }

  const buildPayload = () => {
    if (!draftForm.name.trim()) {
      return { error: 'Draft name is required.' }
    }

    let dsl: any
    try {
      dsl = JSON.parse(draftForm.dslText || '{}')
    } catch {
      return { error: 'DSL must be valid JSON.' }
    }

    const nodes = Array.isArray(dsl?.nodes) ? dsl.nodes : []
    const startNodeId =
      typeof dsl?.startNodeId === 'string'
        ? dsl.startNodeId
        : typeof dsl?.start === 'string'
          ? dsl.start
          : nodes[0]?.id
    const startNode = nodes.find((node: any) => node?.id === startNodeId || node?.nodeId === startNodeId)
    const hasTriggerStart = startNode?.type === 'trigger'

    const triggers: FlowTrigger[] = []
    if (hasTriggerStart) {
      const triggerType = (startNode?.triggerType && TRIGGER_METADATA[startNode.triggerType as TriggerType])
        ? (startNode.triggerType as TriggerType)
        : DEFAULT_TRIGGER_TYPE
      const meta = TRIGGER_METADATA[triggerType]
      const rawLabel = typeof startNode?.data?.label === 'string' ? startNode.data.label.trim() : ''
      const label = rawLabel && rawLabel !== FLOW_NODE_LABELS.trigger ? rawLabel : meta?.label
      const rawDescription = typeof startNode?.triggerDescription === 'string'
        ? startNode.triggerDescription.trim()
        : ''
      const description = rawDescription || meta?.description

      const triggerConfig = normalizeTriggerConfig(startNode?.triggerConfig)
      triggers.push({
        type: triggerType,
        ...(label ? { label } : {}),
        ...(description ? { description } : {}),
        ...(triggerConfig ? { config: triggerConfig } : {}),
      })
    }

    const exposedFields: FlowField[] = []
    for (const field of draftForm.fields) {
      const hasContent = Boolean(
        field.key ||
        field.label ||
        field.description ||
        field.optionsText ||
        field.uiGroup ||
        field.uiHelpText ||
        field.uiPlaceholder ||
        field.validationPattern ||
        field.sourceNodeId ||
        field.sourcePath ||
        field.defaultValue !== ''
      )
      if (!hasContent) continue
      if (!field.key.trim() || !field.label.trim()) {
        return { error: 'Each exposed field needs a key and label.' }
      }

      let defaultValue
      try {
        defaultValue = parseDefaultValue(field)
      } catch {
        return { error: `Default value for ${field.label} is invalid.` }
      }

      const options = field.optionsText.trim() ? parseOptionsText(field.optionsText) : []
      const uiOrder = field.uiOrder.trim() ? Number(field.uiOrder) : undefined
      if (field.uiOrder.trim() && Number.isNaN(uiOrder)) {
        return { error: `UI order for ${field.label} must be a number.` }
      }

      const validationMin = field.validationMin.trim() ? Number(field.validationMin) : undefined
      const validationMax = field.validationMax.trim() ? Number(field.validationMax) : undefined
      if ((field.validationMin.trim() && Number.isNaN(validationMin)) ||
          (field.validationMax.trim() && Number.isNaN(validationMax))) {
        return { error: `Validation bounds for ${field.label} must be numbers.` }
      }

      exposedFields.push({
        key: field.key.trim(),
        label: field.label.trim(),
        type: field.type,
        description: field.description.trim() || undefined,
        required: field.required || undefined,
        defaultValue,
        options: options.length ? options : undefined,
        ui: {
          placeholder: field.uiPlaceholder.trim() || undefined,
          helpText: field.uiHelpText.trim() || undefined,
          group: field.uiGroup.trim() || undefined,
          order: uiOrder,
        },
        validation: {
          min: validationMin,
          max: validationMax,
          pattern: field.validationPattern.trim() || undefined,
        },
        source: {
          nodeId: field.sourceNodeId.trim() || undefined,
          path: field.sourcePath.trim() || undefined,
        },
      })
    }

    let previewConversation
    if (draftForm.display.previewText.trim()) {
      try {
        previewConversation = JSON.parse(draftForm.display.previewText)
      } catch {
        return { error: 'Preview conversation must be valid JSON.' }
      }
    }

    const display: FlowDisplay | undefined = {
      outcome: draftForm.display.outcome.trim() || undefined,
      goal: draftForm.display.goal || undefined,
      industry: draftForm.display.industry || undefined,
      setupTime: draftForm.display.setupTime.trim() || undefined,
      collects: draftForm.display.collectsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      icon: draftForm.display.icon.trim() || undefined,
      previewConversation,
    }

    return {
      payload: {
        name: draftForm.name.trim(),
        description: draftForm.description.trim() || undefined,
        status: draftForm.status,
        templateId: draftForm.templateId || undefined,
        dsl,
        triggers,
        exposedFields,
        display,
      },
    }
  }

  const handleSaveDraft = () => {
    if (!selectedDraftId) return
    const result = buildPayload()
    if (result.error || !result.payload) {
      setError(result.error)
      return
    }
    setError(null)
    updateMutation.mutate(result.payload)
  }

  const handlePublish = () => {
    if (!selectedDraftId) return
    const result = buildPayload()
    if (result.error || !result.payload) {
      setError(result.error)
      return
    }
    setError(null)
    publishMutation.mutate({
      ...result.payload,
      dslSnapshot: result.payload.dsl,
      versionLabel: versionLabel.trim() || undefined,
    })
  }

  const handleConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = flowNodes.find((node) => node.id === connection.source)
      const isRouter = sourceNode?.type === 'router'
      setFlowEdges((edges) =>
        addEdge(
          {
            ...connection,
            id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
            type: 'smoothstep',
            condition: isRouter ? { ...ROUTER_DEFAULT_CONDITION, rules: [] } : undefined,
          },
          edges,
        ),
      )
    },
    [flowNodes, setFlowEdges],
  )

  const handleAddNode = useCallback(
    (type: FlowNodeType) => {
      const id = `node-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const position = { x: 120 + flowNodes.length * 40, y: 100 + flowNodes.length * 40 }
      const node: FlowNode = {
        id,
        type,
        position,
        data: { label: FLOW_NODE_LABELS[type] || 'Node' },
      }

      if (type === 'trigger') {
        node.triggerType = DEFAULT_TRIGGER_TYPE
      }
      if (type === 'send_message') {
        node.text = ''
      }
      if (type === 'ai_reply') {
        node.aiSettings = {}
      }
      if (type === 'ai_agent') {
        node.aiSettings = {}
        node.agentSteps = []
        node.agentSystemPrompt = ''
        node.agentEndCondition = ''
        node.agentStopCondition = ''
        node.agentMaxQuestions = undefined
        node.agentSlots = []
      }
      if (type === 'handoff') {
        node.handoff = {
          topic: '',
          summary: '',
        }
      }
      if (type === 'router') {
        node.routing = { matchMode: 'first' }
      }

      node.data = buildNodeData(node)

      setFlowNodes((nodes) => [...nodes, node])
      const currentStart = flowNodes.find((item) => item.id === startNodeId)
      const shouldPromoteTrigger =
        type === 'trigger' && (!startNodeId || currentStart?.type !== 'trigger')
      if (!startNodeId || shouldPromoteTrigger) {
        setStartNodeId(id)
      }
      setSelectedNodeId(id)
      if (flowInstance?.viewportInitialized) {
        setTimeout(() => flowInstance.fitView({ padding: 0.2, duration: 200 }), 0)
      }
    },
    [flowNodes, flowInstance, setFlowNodes, startNodeId],
  )

  const updateNode = useCallback(
    (nodeId: string, updater: (node: FlowNode) => FlowNode) => {
      setFlowNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== nodeId) return node
          const updated = updater(node)
          return {
            ...updated,
            data: buildNodeData(updated),
          }
        }),
      )
    },
    [setFlowNodes],
  )

  const updateEdge = useCallback(
    (edgeId: string, updater: (edge: FlowEdge) => FlowEdge) => {
      setFlowEdges((edges) => edges.map((edge) => (edge.id === edgeId ? updater(edge) : edge)))
    },
    [setFlowEdges],
  )

  const normalizeRouterCondition = useCallback((condition?: RouterCondition): RouterCondition => {
    if (!condition) {
      return { ...ROUTER_DEFAULT_CONDITION, rules: [...(ROUTER_DEFAULT_CONDITION.rules || [])] }
    }
    if (condition.type === 'else') {
      return { type: 'else' }
    }
    return {
      type: 'rules',
      op: condition.op === 'any' ? 'any' : 'all',
      rules: Array.isArray(condition.rules) ? condition.rules : [],
    }
  }, [])

  const buildRouterRule = useCallback((rule?: Partial<RouterRule>): RouterRule => ({
    ...ROUTER_DEFAULT_RULE,
    ...(rule || {}),
  }), [])

  const updateRouterEdgeCondition = useCallback(
    (edgeId: string, updater: (condition: RouterCondition) => RouterCondition) => {
      updateEdge(edgeId, (edge) => ({
        ...edge,
        condition: updater(normalizeRouterCondition(edge.condition)),
      }))
    },
    [normalizeRouterCondition, updateEdge],
  )

  const updateRouterRule = useCallback(
    (edgeId: string, ruleIndex: number, updater: (rule: RouterRule) => RouterRule) => {
      updateRouterEdgeCondition(edgeId, (condition) => {
        if (condition.type === 'else') return condition
        const rules = Array.isArray(condition.rules) ? [...condition.rules] : []
        const current = rules[ruleIndex] || buildRouterRule()
        rules[ruleIndex] = updater(current)
        return { ...condition, rules }
      })
    },
    [buildRouterRule, updateRouterEdgeCondition],
  )

  const addRouterRule = useCallback(
    (edgeId: string) => {
      updateRouterEdgeCondition(edgeId, (condition) => {
        if (condition.type === 'else') return condition
        const rules = Array.isArray(condition.rules) ? [...condition.rules] : []
        rules.push(buildRouterRule())
        return { ...condition, rules }
      })
    },
    [buildRouterRule, updateRouterEdgeCondition],
  )

  const removeRouterRule = useCallback(
    (edgeId: string, ruleIndex: number) => {
      updateRouterEdgeCondition(edgeId, (condition) => {
        if (condition.type === 'else') return condition
        const rules = Array.isArray(condition.rules) ? [...condition.rules] : []
        rules.splice(ruleIndex, 1)
        return { ...condition, rules }
      })
    },
    [updateRouterEdgeCondition],
  )

  const setRouterConditionType = useCallback(
    (edgeId: string, type: RouterCondition['type'], sourceId?: string) => {
      setFlowEdges((edges) =>
        edges.map((edge) => {
          if (edge.id === edgeId) {
            if (type === 'else') {
              return { ...edge, condition: { type: 'else' } }
            }
            const normalized = normalizeRouterCondition(edge.condition)
            if (normalized.type === 'else') {
              return { ...edge, condition: { type: 'rules', op: 'all', rules: [] } }
            }
            return { ...edge, condition: normalized }
          }
          if (type === 'else' && edge.condition?.type === 'else' && edge.source === sourceId) {
            const normalized = normalizeRouterCondition(edge.condition)
            return {
              ...edge,
              condition: {
                type: 'rules',
                op: normalized.op || 'all',
                rules: normalized.rules || [],
              },
            }
          }
          return edge
        }),
      )
    },
    [normalizeRouterCondition, setFlowEdges],
  )

  const insertMessageToken = useCallback(
    (token: string) => {
      if (!selectedNode) return
      updateNode(selectedNode.id, (node) => {
        const current = node.text || node.message || ''
        const separator = current && !current.endsWith(' ') ? ' ' : ''
        return {
          ...node,
          text: `${current}${separator}${token}`,
        }
      })
    },
    [selectedNode, updateNode],
  )

  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return
    const nodeId = selectedNode.id
    setFlowNodes((nodes) => nodes.filter((node) => node.id !== nodeId))
    setFlowEdges((edges) => edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
    if (startNodeId === nodeId) {
      const nextNode = flowNodes.find((node) => node.id !== nodeId)
      setStartNodeId(nextNode?.id || '')
    }
    setSelectedNodeId(null)
  }, [flowNodes, selectedNode, setFlowEdges, setFlowNodes, startNodeId])

  const handleSelectionChange = useCallback(
    ({ nodes }: { nodes: FlowNode[] }) => {
      setSelectedNodeId(nodes[0]?.id || null)
    },
    [setSelectedNodeId],
  )

  const handleApplyDsl = () => {
    try {
      const parsed = JSON.parse(dslEditorText || '{}')
      const { nodes, edges, startNodeId: parsedStart } = parseFlowDsl(parsed)
      const hydratedNodes = nodes.map((node) => ({
        ...node,
        data: {
          ...buildNodeData(node),
          isStart: node.id === parsedStart,
        },
      }))
      setFlowNodes(hydratedNodes)
      setFlowEdges(edges)
      setStartNodeId(parsedStart)
      setDraftForm((prev) => ({ ...prev, dslText: formatJson(parsed) }))
      setDslEditorText(formatJson(parsed))
      setDslEditorDirty(false)
      setError(null)
    } catch {
      setError('Flow DSL must be valid JSON to apply.')
    }
  }

  const handleResetDsl = () => {
    setDslEditorText(draftForm.dslText)
    setDslEditorDirty(false)
  }

  const handleClearFlow = () => {
    setFlowNodes([])
    setFlowEdges([])
    setStartNodeId('')
    setSelectedNodeId(null)
  }

  const handleArrangeFlow = useCallback(() => {
    if (flowNodes.length === 0) return

    const columnSpacing = 260
    const rowSpacing = 140
    const nodeMap = new Map(flowNodes.map((node) => [node.id, node]))
    const edgesBySource = new Map<string, string[]>()

    flowEdges.forEach((edge) => {
      if (!edge.source || !edge.target) return
      const targets = edgesBySource.get(edge.source) ?? []
      targets.push(edge.target)
      edgesBySource.set(edge.source, targets)
    })

    const depthMap = new Map<string, number>()
    const queue: string[] = []

    if (startNodeId && nodeMap.has(startNodeId)) {
      depthMap.set(startNodeId, 0)
      queue.push(startNodeId)
    } else if (flowNodes[0]?.id) {
      depthMap.set(flowNodes[0].id, 0)
      queue.push(flowNodes[0].id)
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()
      if (!nodeId) continue
      const depth = depthMap.get(nodeId) ?? 0
      const targets = edgesBySource.get(nodeId) ?? []
      targets.forEach((targetId) => {
        const nextDepth = depth + 1
        const existingDepth = depthMap.get(targetId)
        if (existingDepth === undefined || nextDepth < existingDepth) {
          depthMap.set(targetId, nextDepth)
          queue.push(targetId)
        }
      })
    }

    const maxDepth = depthMap.size ? Math.max(...Array.from(depthMap.values())) : 0
    flowNodes.forEach((node) => {
      if (!depthMap.has(node.id)) {
        depthMap.set(node.id, maxDepth + 1)
      }
    })

    const grouped = new Map<number, FlowNode[]>()
    flowNodes.forEach((node) => {
      const depth = depthMap.get(node.id) ?? 0
      const group = grouped.get(depth) ?? []
      group.push(node)
      grouped.set(depth, group)
    })

    const arrangedPositions = new Map<string, { x: number; y: number }>()
    Array.from(grouped.entries())
      .sort(([depthA], [depthB]) => depthA - depthB)
      .forEach(([depth, nodes]) => {
        nodes
          .slice()
          .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
          .forEach((node, index) => {
            arrangedPositions.set(node.id, {
              x: depth * columnSpacing,
              y: index * rowSpacing,
            })
          })
      })

    setFlowNodes((nodes) =>
      nodes.map((node) => {
        const position = arrangedPositions.get(node.id)
        if (!position) return node
        return { ...node, position }
      }),
    )

    requestAnimationFrame(() => {
      flowInstance?.fitView({ padding: 0.2, duration: 200 })
    })
  }, [flowEdges, flowInstance, flowNodes, setFlowNodes, startNodeId])

  const handleOpenBuilder = () => {
    if (!selectedDraftId) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', 'builder')
    nextParams.set('draft', selectedDraftId)
    setSearchParams(nextParams)
  }

  const handleCloseBuilder = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('view')
    nextParams.delete('draft')
    setSearchParams(nextParams)
  }

  const renderFlowBuilder = () => (
    <div className="relative h-full w-full bg-gradient-to-br from-background via-muted/20 to-muted/30">
      <div className="absolute inset-0">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          onSelectionChange={handleSelectionChange}
          onInit={setFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          defaultEdgeOptions={{ type: 'smoothstep' }}
          minZoom={0.2}
          maxZoom={1.5}
          className="h-full w-full touch-none"
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} color="rgb(var(--muted-foreground) / 0.25)" />
          <MiniMap
            pannable
            zoomable
            nodeColor={(node) => FLOW_NODE_STYLES[node.type as FlowNodeType]?.miniMap ?? '#4B9AD5'}
            maskColor="rgba(0,0,0,0.08)"
          />
          <Controls position="bottom-right" />
        </ReactFlow>
      </div>

      {!startNodeId ? (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-yellow-500/40 bg-yellow-500/15 px-4 py-1 text-xs text-yellow-800 shadow-sm">
          Choose a start node to define where the flow begins.
        </div>
      ) : !selectedNode ? (
        <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-border bg-card/90 px-4 py-1 text-xs text-muted-foreground shadow-sm">
          Tap a node to edit its settings.
        </div>
      ) : null}

      <div className="absolute right-6 top-6 z-30 flex flex-col items-end gap-3">
        <button
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90"
          onClick={() => setPaletteOpen((prev) => !prev)}
          aria-label="Open node palette"
        >
          <Plus className="h-5 w-5" />
        </button>
        {paletteOpen && (
          <div className="w-64 max-w-[80vw] max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Templates
            </div>
            <div className="mt-3 space-y-2">
              {FLOW_NODE_LIBRARY.map((item) => {
                const style = FLOW_NODE_STYLES[item.type]
                return (
                  <button
                    key={item.type}
                    className="w-full rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-left transition hover:border-primary/50 hover:bg-muted/40"
                    onClick={() => {
                      handleAddNode(item.type)
                      setPaletteOpen(false)
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${style.dot}`} aria-hidden />
                      <item.icon className="h-4 w-4 text-foreground mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.label}</div>
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="absolute left-6 top-6 bottom-6 z-20 w-[360px] max-w-[90vw] flex flex-col gap-3">
        {selectedNode && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur">
            <div className="text-sm font-semibold text-foreground">Inspector</div>
            <datalist id="ai-model-options">
              {AI_MODEL_SUGGESTIONS.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
            <datalist id="router-config-keys">
              {configFieldKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
            <datalist id="router-var-keys">
              {MESSAGE_STATE_VARIABLES.map((item) => (
                <option key={item.key} value={item.key} />
              ))}
            </datalist>
            <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Label</label>
              <input
                className="input w-full"
                value={selectedNode.data.label || ''}
                onChange={(event) =>
                  updateNode(selectedNode.id, (node) => ({
                    ...node,
                    data: { ...node.data, label: event.target.value },
                  }))
                }
              />
            </div>
            {selectedNode.type === 'trigger' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Trigger type</label>
                  <select
                    className="input w-full"
                    value={selectedNode.triggerType || DEFAULT_TRIGGER_TYPE}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        triggerType: event.target.value as TriggerType,
                      }))
                    }
                  >
                    {TRIGGER_LIBRARY.map((trigger) => (
                      <option key={trigger.type} value={trigger.type}>
                        {trigger.label}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-muted-foreground">
                    {TRIGGER_METADATA[selectedNode.triggerType || DEFAULT_TRIGGER_TYPE]?.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Match mode</label>
                  <select
                    className="input w-full"
                    value={selectedTriggerConfig.triggerMode || 'any'}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        triggerConfig: {
                          ...(node.triggerConfig || {}),
                          triggerMode: event.target.value as FlowTriggerConfig['triggerMode'],
                        },
                      }))
                    }
                  >
                    <option value="any">Any (default)</option>
                    <option value="keywords">Keywords</option>
                    <option value="intent">AI intent</option>
                  </select>
                  <div className="text-xs text-muted-foreground">
                    Choose keyword matching or let AI evaluate intent text.
                  </div>
                </div>
                {selectedTriggerConfig.triggerMode === 'keywords' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Keywords (comma-separated)</label>
                      <input
                        className="input w-full"
                        value={formatKeywordList(selectedTriggerConfig.keywords)}
                        onChange={(event) =>
                          updateNode(selectedNode.id, (node) => ({
                            ...node,
                            triggerConfig: {
                              ...(node.triggerConfig || {}),
                              keywords: parseKeywordList(event.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Exclude keywords (comma-separated)</label>
                      <input
                        className="input w-full"
                        value={formatKeywordList(selectedTriggerConfig.excludeKeywords)}
                        onChange={(event) =>
                          updateNode(selectedNode.id, (node) => ({
                            ...node,
                            triggerConfig: {
                              ...(node.triggerConfig || {}),
                              excludeKeywords: parseKeywordList(event.target.value),
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Keyword match</label>
                      <select
                        className="input w-full"
                        value={selectedTriggerConfig.keywordMatch || 'any'}
                        onChange={(event) =>
                          updateNode(selectedNode.id, (node) => ({
                            ...node,
                            triggerConfig: {
                              ...(node.triggerConfig || {}),
                              keywordMatch: event.target.value as FlowTriggerConfig['keywordMatch'],
                            },
                          }))
                        }
                      >
                        <option value="any">Any keyword</option>
                        <option value="all">All keywords</option>
                      </select>
                    </div>
                  </>
                )}
                {selectedTriggerConfig.triggerMode === 'intent' && (
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Intent description</label>
                    <textarea
                      className="input w-full h-24 text-sm"
                      value={selectedTriggerConfig.intentText || ''}
                      onChange={(event) =>
                        updateNode(selectedNode.id, (node) => ({
                          ...node,
                          triggerConfig: {
                            ...(node.triggerConfig || {}),
                            intentText: event.target.value,
                          },
                        }))
                      }
                    />
                    <div className="text-xs text-muted-foreground">
                      Describe the user intent in plain language for AI matching.
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Trigger description</label>
                  <textarea
                    className="input w-full h-20 text-sm"
                    value={selectedNode.triggerDescription || ''}
                    placeholder={TRIGGER_METADATA[selectedNode.triggerType || DEFAULT_TRIGGER_TYPE]?.description}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        triggerDescription: event.target.value,
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Shown to users when they configure the template.
                  </div>
                </div>
              </>
            )}
            {selectedNode.type === 'router' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Match behavior</label>
                  <select
                    className="input w-full"
                    value={selectedNode.routing?.matchMode || 'first'}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        routing: {
                          ...(node.routing || {}),
                          matchMode: event.target.value as 'first' | 'all',
                        },
                      }))
                    }
                  >
                    <option value="first">First matching route (top to bottom)</option>
                    <option value="all">All matching routes (sequential)</option>
                  </select>
                  <div className="text-xs text-muted-foreground">
                    If multiple routes match, the top-most route wins in first-match mode.
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Routes</label>
                    <span className="text-[11px] text-muted-foreground">Top to bottom order</span>
                  </div>
                  {routerEdges.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                      Connect this router to nodes to define branches.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {routerEdges.map((edge, edgeIndex) => {
                        const target = flowNodes.find((node) => node.id === edge.target)
                        const condition = normalizeRouterCondition(edge.condition)
                        const isElse = condition.type === 'else'
                        const rules = condition.type === 'else' ? [] : condition.rules || []
                        return (
                          <div key={edge.id} className="rounded-lg border border-border/70 bg-background/70 p-3">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-foreground">
                                {edgeIndex + 1}. {target?.data?.label || edge.target}
                              </div>
                              <select
                                className="input h-8 text-xs"
                                value={isElse ? 'else' : 'rules'}
                                onChange={(event) =>
                                  setRouterConditionType(
                                    edge.id,
                                    event.target.value as RouterCondition['type'],
                                    selectedNode.id,
                                  )
                                }
                              >
                                <option value="rules">Rules</option>
                                <option value="else">Default (else)</option>
                              </select>
                            </div>

                            {!isElse && (
                              <div className="mt-3 space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Match</span>
                                  <select
                                    className="input h-8 text-xs"
                                    value={condition.op || 'all'}
                                    onChange={(event) =>
                                      updateRouterEdgeCondition(edge.id, (current) => ({
                                        ...current,
                                        op: event.target.value as 'all' | 'any',
                                      }))
                                    }
                                  >
                                    <option value="all">All rules</option>
                                    <option value="any">Any rule</option>
                                  </select>
                                </div>

                                {rules.length === 0 ? (
                                  <div className="text-xs text-muted-foreground">
                                    Add rules so this branch can match.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {rules.map((rule, ruleIndex) => {
                                      const operatorOptions = rule.source === 'message'
                                        ? ROUTER_MESSAGE_OPERATORS
                                        : rule.source === 'context'
                                          ? [{ value: 'equals', label: 'Equals' }]
                                          : ROUTER_OPERATOR_OPTIONS
                                      const isKeywordRule = rule.operator === 'keywords'
                                      const normalizedPath = (rule.path || '').replace(/^vars\./, '')
                                      const isDetectedIntent = rule.source === 'vars'
                                        && normalizedPath === 'detectedIntent'
                                      return (
                                        <div key={`${edge.id}-rule-${ruleIndex}`} className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2">
                                          <div className="flex items-center gap-2">
                                            <select
                                              className="input h-8 text-xs"
                                              value={rule.source}
                                              onChange={(event) => {
                                                const nextSource = event.target.value as RouterRuleSource
                                                const nextOperator = nextSource === 'context'
                                                  ? 'equals'
                                                  : nextSource === 'message'
                                                    ? (rule.operator === 'keywords' || rule.operator === 'contains' || rule.operator === 'equals'
                                                      ? rule.operator
                                                      : 'contains')
                                                    : (rule.operator === 'keywords' ? 'equals' : rule.operator)
                                                const nextPath = nextSource === 'context'
                                                  ? (rule.path === 'hasLink' || rule.path === 'hasAttachment' ? rule.path : 'hasLink')
                                                  : nextSource === 'message'
                                                    ? undefined
                                                    : rule.path
                                                updateRouterRule(edge.id, ruleIndex, () => ({
                                                  ...rule,
                                                  source: nextSource,
                                                  operator: nextOperator,
                                                  path: nextPath,
                                                  match: nextOperator === 'keywords' ? (rule.match || 'any') : undefined,
                                                }))
                                              }}
                                            >
                                              {ROUTER_SOURCE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                            {rule.source === 'context' ? (
                                              <select
                                                className="input h-8 text-xs"
                                                value={rule.path || 'hasLink'}
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    path: event.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="hasLink">Has link</option>
                                                <option value="hasAttachment">Has attachment</option>
                                              </select>
                                            ) : rule.source === 'vars' ? (
                                              <input
                                                className="input h-8 text-xs flex-1"
                                                list="router-var-keys"
                                                placeholder="vars path (e.g. detectedIntent)"
                                                value={rule.path || ''}
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    path: event.target.value,
                                                  }))
                                                }
                                              />
                                            ) : rule.source === 'config' ? (
                                              <input
                                                className="input h-8 text-xs flex-1"
                                                list="router-config-keys"
                                                placeholder="config path (e.g. package.tier)"
                                                value={rule.path || ''}
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    path: event.target.value,
                                                  }))
                                                }
                                              />
                                            ) : (
                                              <div className="text-[11px] text-muted-foreground">Message text</div>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2">
                                            <select
                                              className="input h-8 text-xs"
                                              value={rule.operator}
                                              onChange={(event) => {
                                                const nextOperator = event.target.value as RouterRuleOperator
                                                updateRouterRule(edge.id, ruleIndex, () => ({
                                                  ...rule,
                                                  operator: nextOperator,
                                                  match: nextOperator === 'keywords' ? (rule.match || 'any') : undefined,
                                                  value: nextOperator === 'keywords' && !Array.isArray(rule.value) ? [] : rule.value,
                                                }))
                                              }}
                                            >
                                              {operatorOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                  {option.label}
                                                </option>
                                              ))}
                                            </select>
                                            {rule.source === 'context' ? (
                                              <select
                                                className="input h-8 text-xs"
                                                value={rule.value === false ? 'false' : 'true'}
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    value: event.target.value === 'true',
                                                  }))
                                                }
                                              >
                                                <option value="true">True</option>
                                                <option value="false">False</option>
                                              </select>
                                            ) : isKeywordRule ? (
                                              <>
                                                <input
                                                  className="input h-8 text-xs flex-1"
                                                  placeholder="Keywords, comma-separated"
                                                  value={formatKeywordList(
                                                    Array.isArray(rule.value) ? rule.value : [],
                                                  )}
                                                  onChange={(event) =>
                                                    updateRouterRule(edge.id, ruleIndex, () => ({
                                                      ...rule,
                                                      value: parseKeywordList(event.target.value),
                                                    }))
                                                  }
                                                />
                                                <select
                                                  className="input h-8 text-xs"
                                                  value={rule.match || 'any'}
                                                  onChange={(event) =>
                                                    updateRouterRule(edge.id, ruleIndex, () => ({
                                                      ...rule,
                                                      match: event.target.value as 'any' | 'all',
                                                    }))
                                                  }
                                                >
                                                  <option value="any">Any</option>
                                                  <option value="all">All</option>
                                                </select>
                                              </>
                                            ) : isDetectedIntent && rule.operator === 'equals' && intentOptions.length > 0 ? (
                                              <select
                                                className="input h-8 text-xs flex-1"
                                                value={typeof rule.value === 'string' ? rule.value : ''}
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    value: event.target.value,
                                                  }))
                                                }
                                              >
                                                <option value="">Select intent</option>
                                                {intentOptions.map((option: any) => (
                                                  <option key={option.value} value={option.value}>
                                                    {option.value}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : rule.operator === 'gt' || rule.operator === 'lt' ? (
                                              <input
                                                className="input h-8 text-xs w-28"
                                                type="number"
                                                value={
                                                  typeof rule.value === 'number' || typeof rule.value === 'string'
                                                    ? rule.value
                                                    : ''
                                                }
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    value: parseOptionalNumber(event.target.value),
                                                  }))
                                                }
                                              />
                                            ) : (
                                              <input
                                                className="input h-8 text-xs flex-1"
                                                value={
                                                  typeof rule.value === 'string' || typeof rule.value === 'number'
                                                    ? rule.value
                                                    : typeof rule.value === 'boolean'
                                                      ? (rule.value ? 'true' : 'false')
                                                      : ''
                                                }
                                                onChange={(event) =>
                                                  updateRouterRule(edge.id, ruleIndex, () => ({
                                                    ...rule,
                                                    value: event.target.value,
                                                  }))
                                                }
                                              />
                                            )}
                                            <button
                                              type="button"
                                              className="text-xs text-red-400 hover:text-red-300"
                                              onClick={() => removeRouterRule(edge.id, ruleIndex)}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                <button
                                  type="button"
                                  className="btn btn-secondary h-8 text-xs"
                                  onClick={() => addRouterRule(edge.id)}
                                >
                                  Add rule
                                </button>
                              </div>
                            )}

                            {isElse && (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Default branch when no other routes match.
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
            {selectedNode.type !== 'trigger'
              && selectedNode.type !== 'detect_intent'
              && selectedNode.type !== 'router' && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Wait for reply</label>
                <select
                  className="input w-full"
                  value={selectedNode.waitForReply ? 'yes' : 'no'}
                  onChange={(event) =>
                    updateNode(selectedNode.id, (node) => ({
                      ...node,
                      waitForReply: event.target.value === 'yes',
                    }))
                  }
                >
                  <option value="no">No</option>
                  <option value="yes">Pause after this step</option>
                </select>
              </div>
            )}
            {selectedNode.type === 'detect_intent' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <input
                    className="input w-full"
                    list="ai-model-options"
                    value={selectedNode.intentSettings?.model || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        intentSettings: {
                          ...(node.intentSettings || {}),
                          model: event.target.value,
                        },
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Leave blank to use the default intent model.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Reasoning effort</label>
                  <select
                    className="input w-full"
                    value={selectedNode.intentSettings?.reasoningEffort || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        intentSettings: {
                          ...(node.intentSettings || {}),
                          reasoningEffort: event.target.value
                            ? (event.target.value as FlowIntentSettings['reasoningEffort'])
                            : undefined,
                        },
                      }))
                    }
                  >
                    <option value="">Auto (model default)</option>
                    {REASONING_EFFORT_OPTIONS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Temperature</label>
                  <input
                    className="input w-full"
                    type="number"
                    step="0.1"
                    value={selectedNode.intentSettings?.temperature ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        intentSettings: {
                          ...(node.intentSettings || {}),
                          temperature: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Node logging</label>
              <div className="flex items-center gap-2">
                <input
                  id="node-logging"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedNode.logEnabled !== false}
                  onChange={(event) =>
                    updateNode(selectedNode.id, (node) => ({
                      ...node,
                      logEnabled: event.target.checked,
                    }))
                  }
                />
                <label htmlFor="node-logging" className="text-sm text-muted-foreground">
                  Enable logging for this node
                </label>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Disable to suppress runtime logs for this step.
              </div>
            </div>

            {selectedNode.type === 'send_message' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Message text</label>
                  <textarea
                    className="input w-full h-24 text-sm"
                    value={selectedNode.text || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        text: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">State variables</label>
                    <span className="text-[11px] text-muted-foreground">Click to insert</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MESSAGE_STATE_VARIABLES.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className="px-2.5 py-1 rounded-full border border-border/70 text-[11px] text-foreground hover:border-primary/50 hover:bg-muted/40 transition"
                        onClick={() => insertMessageToken(item.token)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Available after a Detect intent or AI Agent step runs.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Buttons (one per line)</label>
                  <textarea
                    className="input w-full h-24 text-xs font-mono"
                    value={formatButtonList(selectedNode.buttons)}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        buttons: parseButtonList(event.target.value),
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Use <code>label|payload</code> for custom payloads.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Tags (comma-separated)</label>
                  <input
                    className="input w-full"
                    value={formatTags(selectedNode.tags)}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        tags: parseTags(event.target.value),
                      }))
                    }
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'ai_reply' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Tone</label>
                  <input
                    className="input w-full"
                    value={selectedNode.aiSettings?.tone || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          tone: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max reply sentences</label>
                  <input
                    className="input w-full"
                    value={selectedNode.aiSettings?.maxReplySentences ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          maxReplySentences: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">History limit</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="1"
                    step="1"
                    value={selectedNode.aiSettings?.historyLimit ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          historyLimit: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Number of recent messages sent to the model.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedNode.aiSettings?.ragEnabled !== false}
                      onChange={(event) =>
                        updateNode(selectedNode.id, (node) => ({
                          ...node,
                          aiSettings: {
                            ...(node.aiSettings || {}),
                            ragEnabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    Enable semantic RAG (vector search)
                  </label>
                  <div className="text-[11px] text-muted-foreground">
                    Disable to ignore vector matches in replies.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <input
                    className="input w-full"
                    list="ai-model-options"
                    value={selectedNode.aiSettings?.model || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          model: event.target.value,
                        },
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Leave blank to use the workspace default model.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Reasoning effort</label>
                  <select
                    className="input w-full"
                    value={selectedNode.aiSettings?.reasoningEffort || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          reasoningEffort: event.target.value
                            ? (event.target.value as FlowAiSettings['reasoningEffort'])
                            : undefined,
                        },
                      }))
                    }
                  >
                    <option value="">Auto (model default)</option>
                    {REASONING_EFFORT_OPTIONS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-muted-foreground">
                    Applied only for reasoning-capable models (gpt-5, o-series).
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Temperature</label>
                  <input
                    className="input w-full"
                    type="number"
                    step="0.1"
                    value={selectedNode.aiSettings?.temperature ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          temperature: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max output tokens</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="1"
                    step="1"
                    value={selectedNode.aiSettings?.maxOutputTokens ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          maxOutputTokens: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Knowledge item IDs</label>
                  <input
                    className="input w-full"
                    value={formatKnowledgeIds(selectedNode.knowledgeItemIds)}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        knowledgeItemIds: parseKnowledgeIds(event.target.value),
                      }))
                    }
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'ai_agent' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">System prompt</label>
                  <textarea
                    className="input w-full h-28 text-sm"
                    value={selectedNode.agentSystemPrompt || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        agentSystemPrompt: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Agent steps</label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:text-primary/80"
                      onClick={() =>
                        updateNode(selectedNode.id, (node) => ({
                          ...node,
                          agentSteps: [...(node.agentSteps || []), ''],
                        }))
                      }
                    >
                      + Add step
                    </button>
                  </div>
                  {Array.isArray(selectedNode.agentSteps) && selectedNode.agentSteps.length > 0 ? (
                    <div className="space-y-2">
                      {selectedNode.agentSteps.map((step, index) => (
                        <div key={`${selectedNode.id}-agent-step-${index}`} className="flex items-start gap-2">
                          <span className="mt-2 text-xs text-muted-foreground">{index + 1}.</span>
                          <input
                            className="input flex-1"
                            value={step}
                            onChange={(event) =>
                              updateNode(selectedNode.id, (node) => {
                                const nextSteps = Array.isArray(node.agentSteps)
                                  ? [...node.agentSteps]
                                  : []
                                nextSteps[index] = event.target.value
                                return { ...node, agentSteps: nextSteps }
                              })
                            }
                          />
                          <button
                            type="button"
                            className="mt-2 text-xs text-rose-400 hover:text-rose-300"
                            onClick={() =>
                              updateNode(selectedNode.id, (node) => ({
                                ...node,
                                agentSteps: (node.agentSteps || []).filter((_, i) => i !== index),
                              }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No steps yet.</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">End conversation prompt</label>
                  <textarea
                    className="input w-full h-20 text-sm"
                    value={selectedNode.agentEndCondition || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        agentEndCondition: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Stop condition prompt</label>
                  <textarea
                    className="input w-full h-20 text-sm"
                    value={selectedNode.agentStopCondition || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        agentStopCondition: event.target.value,
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    When this condition is met, the agent ends immediately and continues the flow.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max questions</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    step="1"
                    value={selectedNode.agentMaxQuestions ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        agentMaxQuestions: parseOptionalNumber(event.target.value),
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Leave blank for unlimited follow-up questions.
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Agent slots</label>
                    <button
                      type="button"
                      className="text-xs text-primary hover:text-primary/80"
                      onClick={() =>
                        updateNode(selectedNode.id, (node) => ({
                          ...node,
                          agentSlots: [
                            ...(node.agentSlots || []),
                            { key: '', question: '', defaultValue: '' },
                          ],
                        }))
                      }
                    >
                      + Add slot
                    </button>
                  </div>
                  {Array.isArray(selectedNode.agentSlots) && selectedNode.agentSlots.length > 0 ? (
                    <div className="space-y-3">
                      {selectedNode.agentSlots.map((slot, index) => (
                        <div key={`${selectedNode.id}-agent-slot-${index}`} className="rounded-lg border border-border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Slot {index + 1}</span>
                            <button
                              type="button"
                              className="text-xs text-rose-400 hover:text-rose-300"
                              onClick={() =>
                                updateNode(selectedNode.id, (node) => ({
                                  ...node,
                                  agentSlots: (node.agentSlots || []).filter((_, i) => i !== index),
                                }))
                              }
                            >
                              Remove
                            </button>
                          </div>
                          <input
                            className="input w-full"
                            placeholder="Slot key (e.g., productType)"
                            value={slot.key}
                            onChange={(event) =>
                              updateNode(selectedNode.id, (node) => {
                                const nextSlots = Array.isArray(node.agentSlots)
                                  ? [...node.agentSlots]
                                  : []
                                nextSlots[index] = { ...nextSlots[index], key: event.target.value }
                                return { ...node, agentSlots: nextSlots }
                              })
                            }
                          />
                          <input
                            className="input w-full"
                            placeholder="Question to ask when missing"
                            value={slot.question || ''}
                            onChange={(event) =>
                              updateNode(selectedNode.id, (node) => {
                                const nextSlots = Array.isArray(node.agentSlots)
                                  ? [...node.agentSlots]
                                  : []
                                nextSlots[index] = { ...nextSlots[index], question: event.target.value }
                                return { ...node, agentSlots: nextSlots }
                              })
                            }
                          />
                          <input
                            className="input w-full"
                            placeholder="Default value (optional)"
                            value={slot.defaultValue || ''}
                            onChange={(event) =>
                              updateNode(selectedNode.id, (node) => {
                                const nextSlots = Array.isArray(node.agentSlots)
                                  ? [...node.agentSlots]
                                  : []
                                nextSlots[index] = { ...nextSlots[index], defaultValue: event.target.value }
                                return { ...node, agentSlots: nextSlots }
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No slots yet.</div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Tone</label>
                  <input
                    className="input w-full"
                    value={selectedNode.aiSettings?.tone || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          tone: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max reply sentences</label>
                  <input
                    className="input w-full"
                    value={selectedNode.aiSettings?.maxReplySentences ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          maxReplySentences: event.target.value
                            ? Number(event.target.value)
                            : undefined,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">History limit</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="1"
                    step="1"
                    value={selectedNode.aiSettings?.historyLimit ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          historyLimit: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Number of recent messages sent to the model.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={selectedNode.aiSettings?.ragEnabled !== false}
                      onChange={(event) =>
                        updateNode(selectedNode.id, (node) => ({
                          ...node,
                          aiSettings: {
                            ...(node.aiSettings || {}),
                            ragEnabled: event.target.checked,
                          },
                        }))
                      }
                    />
                    Enable semantic RAG (vector search)
                  </label>
                  <div className="text-[11px] text-muted-foreground">
                    Disable to ignore vector matches in replies.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <input
                    className="input w-full"
                    list="ai-model-options"
                    value={selectedNode.aiSettings?.model || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          model: event.target.value,
                        },
                      }))
                    }
                  />
                  <div className="text-[11px] text-muted-foreground">
                    Leave blank to use the workspace default model.
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Reasoning effort</label>
                  <select
                    className="input w-full"
                    value={selectedNode.aiSettings?.reasoningEffort || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          reasoningEffort: event.target.value
                            ? (event.target.value as FlowAiSettings['reasoningEffort'])
                            : undefined,
                        },
                      }))
                    }
                  >
                    <option value="">Auto (model default)</option>
                    {REASONING_EFFORT_OPTIONS.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-muted-foreground">
                    Applied only for reasoning-capable models (gpt-5, o-series).
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Temperature</label>
                  <input
                    className="input w-full"
                    type="number"
                    step="0.1"
                    value={selectedNode.aiSettings?.temperature ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          temperature: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max output tokens</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="1"
                    step="1"
                    value={selectedNode.aiSettings?.maxOutputTokens ?? ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        aiSettings: {
                          ...(node.aiSettings || {}),
                          maxOutputTokens: parseOptionalNumber(event.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Knowledge item IDs</label>
                  <input
                    className="input w-full"
                    value={formatKnowledgeIds(selectedNode.knowledgeItemIds)}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        knowledgeItemIds: parseKnowledgeIds(event.target.value),
                      }))
                    }
                  />
                </div>
              </>
            )}

            {selectedNode.type === 'handoff' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Topic</label>
                  <input
                    className="input w-full"
                    value={selectedNode.handoff?.topic || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        handoff: {
                          ...(node.handoff || {}),
                          topic: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Summary</label>
                  <textarea
                    className="input w-full h-20 text-sm"
                    value={selectedNode.handoff?.summary || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        handoff: {
                          ...(node.handoff || {}),
                          summary: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Customer message (optional)</label>
                  <textarea
                    className="input w-full h-20 text-sm"
                    value={selectedNode.handoff?.message || ''}
                    onChange={(event) =>
                      updateNode(selectedNode.id, (node) => ({
                        ...node,
                        handoff: {
                          ...(node.handoff || {}),
                          message: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </>
            )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={() => setStartNodeId(selectedNode.id)}
                >
                  <Play className="w-4 h-4" />
                  Set as start
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2 text-red-500"
                  onClick={handleDeleteNode}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete node
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2 shrink-0 mt-auto">
          <div className="rounded-lg border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Play className="w-3 h-3" />
              Start node: {startNodeId ? startNodeLabel : 'Not set'}
            </div>
            <div className="mt-1">Flow stats: {flowStats.nodes} nodes · {flowStats.edges} connections</div>
          </div>

          <details className="w-full max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card/90 p-3 text-xs text-muted-foreground shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Advanced: Flow DSL JSON
            </summary>
            <div className="mt-3 space-y-3">
              <textarea
                className="input w-full h-48 font-mono text-xs"
                value={dslEditorText}
                onChange={(event) => {
                  setDslEditorText(event.target.value)
                  setDslEditorDirty(true)
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleApplyDsl}
                  disabled={!dslEditorDirty}
                >
                  <UploadCloud className="w-4 h-4" />
                  Apply JSON
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleResetDsl}
                  disabled={!dslEditorDirty}
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={() => navigator.clipboard.writeText(dslEditorText)}
                >
                  <Copy className="w-4 h-4" />
                  Copy JSON
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  )

  const flowTitle = draftForm.name.trim() || selectedDraft?.name || 'Untitled flow'
  const statusLabel = draftForm.status === 'archived' ? 'Archived' : 'Draft'
  const canEditFlow = Boolean(selectedDraftId)

  return (
    <>
      <div className="space-y-6">
        <AutomationsTabs />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Flow Builder</h1>
            <p className="text-muted-foreground mt-1">
              Author internal flow drafts, control display metadata, and expose configurable fields.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-secondary flex items-center gap-2"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })}
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              className="btn btn-primary flex items-center gap-2"
              onClick={() => setNewDraftOpen((prev) => !prev)}
            >
              <Plus className="w-4 h-4" />
              New draft
            </button>
          </div>
        </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="card p-4 space-y-4">
          {newDraftOpen && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="text-sm font-semibold text-foreground">New flow draft</div>
              <input
                className="input w-full"
                placeholder="Draft name"
                value={newDraftName}
                onChange={(event) => setNewDraftName(event.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Description (optional)"
                value={newDraftDescription}
                onChange={(event) => setNewDraftDescription(event.target.value)}
              />
              <select
                className="input w-full"
                value={newDraftTemplateId}
                onChange={(event) => setNewDraftTemplateId(event.target.value)}
              >
                <option value="">Create new template on publish</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary w-full"
                onClick={handleCreateDraft}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create draft'}
              </button>
            </div>
          )}

          <div className="text-sm font-semibold text-foreground">Drafts</div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No drafts yet.</div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => {
                const isActive = draft._id === selectedDraftId
                const templateName = draft.templateId ? templateMap.get(draft.templateId)?.name : ''
                return (
                  <button
                    key={draft._id}
                    onClick={() => setSelectedDraftId(draft._id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{draft.name}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{draft.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {templateName ? `Template: ${templateName}` : 'New template on publish'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card p-6 space-y-6">
          {!selectedDraft ? (
            <div className="text-sm text-muted-foreground">Select a draft to edit.</div>
          ) : (
            <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Draft settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Update metadata, configurable fields, and publish versions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleOpenBuilder}
                      disabled={!canEditFlow}
                    >
                      <Maximize2 className="w-4 h-4" />
                      Edit flow
                    </button>
                    <button
                      className="btn btn-secondary flex items-center gap-2"
                      onClick={handleSaveDraft}
                      disabled={updateMutation.isPending}
                    >
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'Saving...' : 'Save draft'}
                  </button>
                  <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={handlePublish}
                    disabled={publishMutation.isPending}
                  >
                    <UploadCloud className="w-4 h-4" />
                    {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Draft name</label>
                  <input
                    className="input w-full"
                    value={draftForm.name}
                    onChange={(event) => setDraftForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <select
                    className="input w-full"
                    value={draftForm.status}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, status: event.target.value as DraftForm['status'] }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-muted-foreground">Description</label>
                  <input
                    className="input w-full"
                    value={draftForm.description}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-muted-foreground">Template association</label>
                  <select
                    className="input w-full"
                    value={draftForm.templateId}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, templateId: event.target.value }))
                    }
                  >
                    <option value="">Create new template on publish</option>
                    {templates.map((template) => (
                      <option key={template._id} value={template._id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Display metadata</h3>
                    <p className="text-sm text-muted-foreground">
                      Controls what the end user sees in the automation gallery.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Outcome</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.outcome}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, outcome: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Setup time</label>
                    <input
                      className="input w-full"
                      placeholder="~5 min"
                      value={draftForm.display.setupTime}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, setupTime: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Goal</label>
                    <select
                      className="input w-full"
                      value={draftForm.display.goal}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, goal: event.target.value as DraftForm['display']['goal'] },
                        }))
                      }
                    >
                      <option value="">Select goal</option>
                      {GOAL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Industry</label>
                    <select
                      className="input w-full"
                      value={draftForm.display.industry}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, industry: event.target.value as DraftForm['display']['industry'] },
                        }))
                      }
                    >
                      <option value="">Select industry</option>
                      {INDUSTRY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Collects (comma-separated)</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.collectsText}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, collectsText: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Icon key</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.icon}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, icon: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm text-muted-foreground">Preview conversation (JSON)</label>
                    <textarea
                      className="input w-full h-32 font-mono text-xs"
                      value={draftForm.display.previewText}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, previewText: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Exposed fields</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose which inputs are configurable on the customer automations page.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={() =>
                      setDraftForm((prev) => ({
                        ...prev,
                        fields: [...prev.fields, buildFieldForm()],
                      }))
                    }
                  >
                    <Plus className="w-4 h-4" />
                    Add field
                  </button>
                </div>
                {draftForm.fields.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No exposed fields yet.</div>
                ) : (
                  <div className="space-y-4">
                    {draftForm.fields.map((field, index) => (
                      <div key={field.id} className="rounded-lg border border-border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Field {index + 1}</div>
                          <button
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                            onClick={() =>
                              setDraftForm((prev) => ({
                                ...prev,
                                fields: prev.fields.filter((item) => item.id !== field.id),
                              }))
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Key</label>
                            <input
                              className="input w-full"
                              value={field.key}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id ? { ...item, key: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Label</label>
                            <input
                              className="input w-full"
                              value={field.label}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id ? { ...item, label: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Type</label>
                            <select
                              className="input w-full"
                              value={field.type}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, type: event.target.value as FieldForm['type'] }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              {FIELD_TYPES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm text-muted-foreground">Description</label>
                            <input
                              className="input w-full"
                              value={field.description}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, description: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Required</label>
                            <select
                              className="input w-full"
                              value={field.required ? 'yes' : 'no'}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, required: event.target.value === 'yes' }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              <option value="no">Optional</option>
                              <option value="yes">Required</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Default value</label>
                            {field.type === 'boolean' ? (
                              <select
                                className="input w-full"
                                value={field.defaultValue ? 'true' : 'false'}
                                onChange={(event) =>
                                  setDraftForm((prev) => ({
                                    ...prev,
                                    fields: prev.fields.map((item) =>
                                      item.id === field.id
                                        ? { ...item, defaultValue: event.target.value === 'true' }
                                        : item,
                                    ),
                                  }))
                                }
                              >
                                <option value="false">False</option>
                                <option value="true">True</option>
                              </select>
                            ) : (
                              <input
                                className="input w-full"
                                value={field.defaultValue as string}
                                onChange={(event) =>
                                  setDraftForm((prev) => ({
                                    ...prev,
                                    fields: prev.fields.map((item) =>
                                      item.id === field.id
                                        ? { ...item, defaultValue: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            )}
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">
                              Options (one per line: label|value)
                            </label>
                            <textarea
                              className="input w-full h-24 font-mono text-xs"
                              value={field.optionsText}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, optionsText: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Group</label>
                            <input
                              className="input w-full"
                              value={field.uiGroup}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiGroup: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">UI order</label>
                            <input
                              className="input w-full"
                              value={field.uiOrder}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiOrder: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Placeholder</label>
                            <input
                              className="input w-full"
                              value={field.uiPlaceholder}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiPlaceholder: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">Help text</label>
                            <input
                              className="input w-full"
                              value={field.uiHelpText}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiHelpText: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Validation min</label>
                            <input
                              className="input w-full"
                              value={field.validationMin}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationMin: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Validation max</label>
                            <input
                              className="input w-full"
                              value={field.validationMax}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationMax: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">Validation pattern</label>
                            <input
                              className="input w-full"
                              value={field.validationPattern}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationPattern: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Source node</label>
                            <input
                              className="input w-full"
                              value={field.sourceNodeId}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, sourceNodeId: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Source path</label>
                            <input
                              className="input w-full"
                              value={field.sourcePath}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, sourcePath: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Version label (optional)</label>
                    <input
                      className="input w-full"
                      value={versionLabel}
                      onChange={(event) => setVersionLabel(event.target.value)}
                      placeholder="e.g. v2.0"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      className="btn btn-primary w-full flex items-center gap-2 justify-center"
                      onClick={handlePublish}
                      disabled={publishMutation.isPending}
                    >
                      <UploadCloud className="w-4 h-4" />
                      {publishMutation.isPending ? 'Publishing...' : 'Publish draft'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {builderOpen && (
        <div className="fixed inset-y-0 right-0 left-0 z-40 bg-background lg:left-20">
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
              <div className="flex items-center gap-3">
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleCloseBuilder}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <div>
                  <div className="text-xs text-muted-foreground">Flow Builder</div>
                  <div className="text-lg font-semibold text-foreground">{flowTitle}</div>
                </div>
                <span className="rounded-full border border-border bg-muted/40 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {statusLabel}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={() => flowInstance?.fitView({ padding: 0.2, duration: 200 })}
                >
                  <Network className="w-4 h-4" />
                  Fit view
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleArrangeFlow}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Arrange
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleClearFlow}
                >
                  <Eraser className="w-4 h-4" />
                  Clear
                </button>
                <button
                  className="btn btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handleSaveDraft}
                  disabled={!canEditFlow || updateMutation.isPending}
                >
                  <Save className="w-4 h-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save draft'}
                </button>
                <button
                  className="btn btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={handlePublish}
                  disabled={!canEditFlow || publishMutation.isPending}
                >
                  <UploadCloud className="w-4 h-4" />
                  {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {!selectedDraft ? (
                <div className="h-full p-6">
                  <div className="rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                    Select a draft on the automations page to edit its flow.
                  </div>
                </div>
              ) : (
                renderFlowBuilder()
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
