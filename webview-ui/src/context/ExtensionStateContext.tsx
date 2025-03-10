import React, { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { DEFAULT_AUTO_APPROVAL_SETTINGS } from "../../../src/shared/AutoApprovalSettings"
import { ExtensionMessage, ExtensionState, DEFAULT_PLATFORM } from "../../../src/shared/ExtensionMessage"
import { ApiConfiguration, ModelInfo, openRouterDefaultModelId, openRouterDefaultModelInfo } from "../../../src/shared/api"
import { findLastIndex } from "../../../src/shared/array"
import { McpMarketplaceCatalog, McpServer } from "../../../src/shared/mcp"
import { convertTextMateToHljs } from "../utils/textMateToHljs"
import { vscode } from "../utils/vscode"
import { DEFAULT_BROWSER_SETTINGS } from "../../../src/shared/BrowserSettings"
import { DEFAULT_CHAT_SETTINGS } from "../../../src/shared/ChatSettings"
import { TelemetrySetting } from "../../../src/shared/TelemetrySetting"

// 定义Context的类型，扩展了ExtensionState并添加额外方法和状态
interface ExtensionStateContextType extends ExtensionState {
	didHydrateState: boolean
	showWelcome: boolean
	theme: any
	openRouterModels: Record<string, ModelInfo>
	openAiModels: string[]
	mcpServers: McpServer[]
	mcpMarketplaceCatalog: McpMarketplaceCatalog
	filePaths: string[]
	setApiConfiguration: (config: ApiConfiguration) => void
	setCustomInstructions: (value?: string) => void
	setTelemetrySetting: (value: TelemetrySetting) => void
	setShowAnnouncement: (value: boolean) => void
	setPlanActSeparateModelsSetting: (value: boolean) => void
}

// 创建Context
const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

// Context Provider组件
export const ExtensionStateContextProvider: React.FC<{
	children: React.ReactNode
}> = ({ children }) => {
	// 初始化状态
	const [state, setState] = useState<ExtensionState>({
		version: "",
		clineMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		autoApprovalSettings: DEFAULT_AUTO_APPROVAL_SETTINGS,
		browserSettings: DEFAULT_BROWSER_SETTINGS,
		chatSettings: DEFAULT_CHAT_SETTINGS,
		platform: DEFAULT_PLATFORM,
		telemetrySetting: "unset",
		vscMachineId: "",
		planActSeparateModelsSetting: true,
	})
	const [didHydrateState, setDidHydrateState] = useState(false) // 状态是否已初始化
	const [showWelcome, setShowWelcome] = useState(false) // 是否显示欢迎页
	const [theme, setTheme] = useState<any>(undefined) // 主题
	const [filePaths, setFilePaths] = useState<string[]>([]) // 文件路径
	// 设置默认OpenRouter模型
	const [openRouterModels, setOpenRouterModels] = useState<Record<string, ModelInfo>>({
		[openRouterDefaultModelId]: openRouterDefaultModelInfo,
	})

	const [openAiModels, setOpenAiModels] = useState<string[]>([]) // OpenAI模型
	const [mcpServers, setMcpServers] = useState<McpServer[]>([]) // MCP服务器
	const [mcpMarketplaceCatalog, setMcpMarketplaceCatalog] = useState<McpMarketplaceCatalog>({ items: [] }) // MCP市场目录

	// 处理从VSCode扩展接收的消息
	const handleMessage = useCallback((event: MessageEvent) => {
		const message: ExtensionMessage = event.data
		switch (message.type) {
			case "state": {
				// 接收和处理扩展状态
				setState(message.state!)
				const config = message.state?.apiConfiguration
				// 检查是否有任何API密钥设置，决定是否显示欢迎页
				const hasKey = config
					? [
							config.apiKey,
							config.openRouterApiKey,
							config.awsRegion,
							config.vertexProjectId,
							config.openAiApiKey,
							config.ollamaModelId,
							config.lmStudioModelId,
							config.liteLlmApiKey,
							config.geminiApiKey,
							config.openAiNativeApiKey,
							config.deepSeekApiKey,
							config.requestyApiKey,
							config.togetherApiKey,
							config.qwenApiKey,
							config.mistralApiKey,
							config.vsCodeLmModelSelector,
							config.clineApiKey,
							config.asksageApiKey,
							config.xaiApiKey,
						].some((key) => key !== undefined)
					: false
				setShowWelcome(!hasKey)
				setDidHydrateState(true) // 标记状态已初始化
				break
			}
			case "theme": {
				// 处理主题更新
				if (message.text) {
					setTheme(convertTextMateToHljs(JSON.parse(message.text)))
				}
				break
			}
			case "workspaceUpdated": {
				// 处理工作区更新
				setFilePaths(message.filePaths ?? [])
				break
			}
			case "partialMessage": {
				// 处理部分消息更新
				const partialMessage = message.partialMessage!
				setState((prevState) => {
					// 查找并更新具有相同时间戳的消息
					const lastIndex = findLastIndex(prevState.clineMessages, (msg) => msg.ts === partialMessage.ts)
					if (lastIndex !== -1) {
						const newClineMessages = [...prevState.clineMessages]
						newClineMessages[lastIndex] = partialMessage
						return { ...prevState, clineMessages: newClineMessages }
					}
					return prevState
				})
				break
			}
			case "openRouterModels": {
				// 更新OpenRouter模型列表
				const updatedModels = message.openRouterModels ?? {}
				setOpenRouterModels({
					[openRouterDefaultModelId]: openRouterDefaultModelInfo, // 保留默认模型
					...updatedModels,
				})
				break
			}
			case "openAiModels": {
				// 更新OpenAI模型列表
				const updatedModels = message.openAiModels ?? []
				setOpenAiModels(updatedModels)
				break
			}
			case "mcpServers": {
				// 更新MCP服务器列表
				setMcpServers(message.mcpServers ?? [])
				break
			}
			case "mcpMarketplaceCatalog": {
				// 更新MCP市场目录
				if (message.mcpMarketplaceCatalog) {
					setMcpMarketplaceCatalog(message.mcpMarketplaceCatalog)
				}
				break
			}
		}
	}, [])

	// 注册消息事件监听器
	useEvent("message", handleMessage)

	// 组件挂载时通知VSCode扩展WebView已启动
	useEffect(() => {
		vscode.postMessage({ type: "webviewDidLaunch" })
	}, [])

	// 构建Context值
	const contextValue: ExtensionStateContextType = {
		...state,
		didHydrateState,
		showWelcome,
		theme,
		openRouterModels,
		openAiModels,
		mcpServers,
		mcpMarketplaceCatalog,
		filePaths,
		// 提供更新状态的方法
		setApiConfiguration: (value) =>
			setState((prevState) => ({
				...prevState,
				apiConfiguration: value,
			})),
		setCustomInstructions: (value) =>
			setState((prevState) => ({
				...prevState,
				customInstructions: value,
			})),
		setTelemetrySetting: (value) =>
			setState((prevState) => ({
				...prevState,
				telemetrySetting: value,
			})),
		setPlanActSeparateModelsSetting: (value) =>
			setState((prevState) => ({
				...prevState,
				planActSeparateModelsSetting: value,
			})),
		setShowAnnouncement: (value) =>
			setState((prevState) => ({
				...prevState,
				shouldShowAnnouncement: value,
			})),
	}

	// 提供Context值给子组件
	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

// 自定义Hook，用于在组件中访问ExtensionState
export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)
	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}
	return context
}
