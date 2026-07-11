export class AsyncActionLock {
    private pending = false;

    public isPending(): boolean {
        return this.pending;
    }

    public async run(action: () => Promise<void>): Promise<boolean> {
        if (this.pending) return false;
        this.pending = true;
        try {
            await action();
            return true;
        } finally {
            this.pending = false;
        }
    }
}
