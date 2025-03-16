import { AssistantMessageContent, TextContent, ToolUse, ToolParamName, toolParamNames, toolUseNames, ToolUseName } from "."

/**
 * 解析结构化的助手消息内容，识别其中的工具调用标签和文本内容
 *
 * @example 输入示例
 * // 包含工具调用和文本的混合内容
 * const input = "正在执行<execute_command><command>ls -l</command></execute_command>查看目录";
 *
 * @example 输出示例
 * [
 *   { type: "text", content: "正在执行", partial: false },
 *   {
 *     type: "tool_use",
 *     name: "execute_command",
 *     params: { command: "ls -l" },
 *     partial: false
 *   },
 *   { type: "text", content: "查看目录", partial: false }
 * ]
 *
 * @param assistantMessage - 需要解析的原始消息字符串，可能包含纯文本内容、XML风格标签或混合内容
 * @returns 解析后的消息块数组
 */
export function parseAssistantMessage(assistantMessage: string): AssistantMessageContent[] {
	// 状态跟踪器初始化
	const state = createParserState()

	// 逐字符处理消息内容
	for (let i = 0; i < assistantMessage.length; i++) {
		const char = assistantMessage[i]
		state.accumulator += char

		// 根据当前状态处理字符
		if (state.currentToolUse && state.currentParamName) {
			// 处理工具参数
			processToolParameter(state)
		} else if (state.currentToolUse) {
			// 处理工具调用
			processToolUse(state)
		} else {
			// 检测工具调用或处理文本
			detectToolUseOrProcessText(state)
		}
	}

	// 处理未完成的内容
	finalizeUnfinishedContent(state)

	return state.contentBlocks
}

/**
 * 创建并初始化解析器状态对象
 *
 * @returns 初始化的解析器状态对象
 */
function createParserState() {
	return {
		contentBlocks: [] as AssistantMessageContent[],
		currentTextContent: undefined as TextContent | undefined,
		currentTextContentStartIndex: 0,
		currentToolUse: undefined as ToolUse | undefined,
		currentToolUseStartIndex: 0,
		currentParamName: undefined as ToolParamName | undefined,
		currentParamValueStartIndex: 0,
		accumulator: "",
		didStartToolUse: false,
	}
}

/**
 * 处理工具参数值
 *
 * @param state - 当前解析器状态
 */
function processToolParameter(state: ReturnType<typeof createParserState>): void {
	if (!state.currentToolUse || !state.currentParamName) {
		return
	}

	const currentParamValue = state.accumulator.slice(state.currentParamValueStartIndex)
	const paramClosingTag = `</${state.currentParamName}>`

	if (currentParamValue.endsWith(paramClosingTag)) {
		// 提取并保存参数值（去除闭合标签）
		state.currentToolUse.params[state.currentParamName] = currentParamValue.slice(0, -paramClosingTag.length).trim()
		state.currentParamName = undefined
	}
	// 否则继续累积参数值
}

/**
 * 处理工具调用过程
 *
 * @param state - 当前解析器状态
 */
function processToolUse(state: ReturnType<typeof createParserState>): void {
	if (!state.currentToolUse) {
		return
	}

	const currentToolValue = state.accumulator.slice(state.currentToolUseStartIndex)
	const toolUseClosingTag = `</${state.currentToolUse.name}>`

	if (currentToolValue.endsWith(toolUseClosingTag)) {
		// 工具调用完成
		finalizeToolUse(state)
	} else {
		// 检测可能的参数开始标签
		detectParameterStartTag(state) ||
			// 特殊处理write_to_file
			handleWriteToFileSpecialCase(state)
	}
}

/**
 * 完成工具调用处理并添加到内容块
 *
 * @param state - 当前解析器状态
 */
function finalizeToolUse(state: ReturnType<typeof createParserState>): void {
	if (!state.currentToolUse) {
		return
	}

	state.currentToolUse.partial = false
	state.contentBlocks.push(state.currentToolUse)
	state.currentToolUse = undefined
}

/**
 * 检测参数开始标签
 *
 * @param state - 当前解析器状态
 * @returns 是否检测到参数开始标签
 */
function detectParameterStartTag(state: ReturnType<typeof createParserState>): boolean {
	const possibleParamOpeningTags = toolParamNames.map((name) => `<${name}>`)

	for (const paramOpeningTag of possibleParamOpeningTags) {
		if (state.accumulator.endsWith(paramOpeningTag)) {
			// 发现参数开始标签
			state.currentParamName = paramOpeningTag.slice(1, -1) as ToolParamName
			state.currentParamValueStartIndex = state.accumulator.length
			return true
		}
	}

	return false
}

/**
 * 处理write_to_file的特殊情况（文件内容可能包含闭合标签）
 *
 * @param state - 当前解析器状态
 * @returns 是否处理了特殊情况
 */
function handleWriteToFileSpecialCase(state: ReturnType<typeof createParserState>): boolean {
	if (!state.currentToolUse) {
		return false
	}

	const contentParamName: ToolParamName = "content"

	if (state.currentToolUse.name === "write_to_file" && state.accumulator.endsWith(`</${contentParamName}>`)) {
		const toolContent = state.accumulator.slice(state.currentToolUseStartIndex)
		const contentStartTag = `<${contentParamName}>`
		const contentEndTag = `</${contentParamName}>`
		const contentStartIndex = toolContent.indexOf(contentStartTag) + contentStartTag.length
		const contentEndIndex = toolContent.lastIndexOf(contentEndTag)

		if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
			state.currentToolUse.params[contentParamName] = toolContent.slice(contentStartIndex, contentEndIndex).trim()
			return true
		}
	}

	return false
}

/**
 * 检测工具调用开始标签或处理文本内容
 *
 * @param state - 当前解析器状态
 */
function detectToolUseOrProcessText(state: ReturnType<typeof createParserState>): void {
	state.didStartToolUse = detectToolUseStartTag(state)

	if (!state.didStartToolUse) {
		// 处理文本内容
		processTextContent(state)
	}
}

/**
 * 检测工具调用开始标签
 *
 * @param state - 当前解析器状态
 * @returns 是否检测到工具调用开始标签
 */
function detectToolUseStartTag(state: ReturnType<typeof createParserState>): boolean {
	const possibleToolUseOpeningTags = toolUseNames.map((name) => `<${name}>`)

	for (const toolUseOpeningTag of possibleToolUseOpeningTags) {
		if (state.accumulator.endsWith(toolUseOpeningTag)) {
			// 开始一个新的工具调用
			createNewToolUse(state, toolUseOpeningTag)
			return true
		}
	}

	return false
}

/**
 * 创建新的工具调用对象
 *
 * @param state - 当前解析器状态
 * @param toolUseOpeningTag - 工具调用开始标签
 */
function createNewToolUse(state: ReturnType<typeof createParserState>, toolUseOpeningTag: string): void {
	// 创建工具调用对象
	state.currentToolUse = {
		type: "tool_use",
		name: toolUseOpeningTag.slice(1, -1) as ToolUseName,
		params: {},
		partial: true,
	}
	state.currentToolUseStartIndex = state.accumulator.length

	// 如果有正在处理的文本内容，需要完成并保存
	if (state.currentTextContent) {
		finalizeTextContent(state, toolUseOpeningTag)
	}
}

/**
 * 完成并保存文本内容
 *
 * @param state - 当前解析器状态
 * @param toolUseOpeningTag - 可选的工具调用开始标签（用于裁剪文本内容）
 */
function finalizeTextContent(state: ReturnType<typeof createParserState>, toolUseOpeningTag?: string): void {
	if (!state.currentTextContent) {
		return
	}

	state.currentTextContent.partial = false

	// 移除文本末尾可能部分累积的工具标签
	if (toolUseOpeningTag) {
		state.currentTextContent.content = state.currentTextContent.content
			.slice(0, -toolUseOpeningTag.slice(0, -1).length)
			.trim()
	}

	state.contentBlocks.push(state.currentTextContent)
	state.currentTextContent = undefined
}

/**
 * 处理文本内容
 *
 * @param state - 当前解析器状态
 */
function processTextContent(state: ReturnType<typeof createParserState>): void {
	// 第一次遇到文本，初始化起始索引
	if (state.currentTextContent === undefined) {
		state.currentTextContentStartIndex = state.accumulator.length - 1
	}

	// 更新文本内容对象
	state.currentTextContent = {
		type: "text",
		content: state.accumulator.slice(state.currentTextContentStartIndex).trim(),
		partial: true,
	}
}

/**
 * 处理未完成的内容（处理流式传输未闭合的情况）
 *
 * @param state - 当前解析器状态
 */
function finalizeUnfinishedContent(state: ReturnType<typeof createParserState>): void {
	if (state.currentToolUse) {
		// 处理未完成的工具调用
		if (state.currentParamName) {
			// 处理未完成的参数
			state.currentToolUse.params[state.currentParamName] = state.accumulator
				.slice(state.currentParamValueStartIndex)
				.trim()
		}
		state.contentBlocks.push(state.currentToolUse)
	} else if (state.currentTextContent) {
		// 处理未完成的文本内容
		state.contentBlocks.push(state.currentTextContent)
	}
}
