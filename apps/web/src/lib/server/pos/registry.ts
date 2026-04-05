import { BasePosAdapter } from './adapters/base';
import { SquareAdapter } from './adapters/SquareAdapter';
import { CloverAdapter } from './adapters/CloverAdapter';
import { ToastAdapter } from './adapters/ToastAdapter';
import { ShopifyAdapter } from './adapters/ShopifyAdapter';

class PosAdapterRegistry {
  private adapters = new Map<string, BasePosAdapter>();

  constructor() {
    this.register(new SquareAdapter());
    this.register(new CloverAdapter());
    this.register(new ToastAdapter());
    this.register(new ShopifyAdapter());
  }

  private register(adapter: BasePosAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): BasePosAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`Unknown POS provider: ${provider}`);
    return adapter;
  }

  getAll(): BasePosAdapter[] {
    return [...this.adapters.values()];
  }

  supported(): string[] {
    return [...this.adapters.keys()];
  }
}

export const posRegistry = new PosAdapterRegistry();
