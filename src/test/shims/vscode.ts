export interface Disposable {
  dispose(): void;
}

type CommandCallback = (...args: unknown[]) => unknown;

const registeredCommands = new Map<string, CommandCallback>();

export const commands = {
  registerCommand(commandId: string, callback: CommandCallback): Disposable {
    registeredCommands.set(commandId, callback);

    return {
      dispose(): void {
        registeredCommands.delete(commandId);
      }
    };
  },

  async executeRegisteredCommand(commandId: string, ...args: unknown[]): Promise<unknown> {
    const callback = registeredCommands.get(commandId);
    if (!callback) {
      throw new Error(`Command is not registered: ${commandId}`);
    }

    return callback(...args);
  },

  registeredCommandIds(): string[] {
    return [...registeredCommands.keys()];
  }
};

export const window = {
  informationMessages: [] as string[],

  async showInformationMessage(message: string): Promise<string> {
    window.informationMessages.push(message);
    return message;
  }
};

export function resetVSCodeShim(): void {
  registeredCommands.clear();
  window.informationMessages.length = 0;
}
