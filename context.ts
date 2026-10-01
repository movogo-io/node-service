import type { Json, JsonObject, JsonSafe, JsonSafeObject } from '@movogo-io/host/lib/context'

export * from '@movogo-io/host/lib/context'

export type Stringified<T> = T extends null | boolean | number | string
    ? T
    : T extends JsonSafeObject
      ? JsonObject
      : T extends JsonSafe
        ? Json
        : T extends undefined
          ? never
          : T extends () => unknown
            ? never
            : T extends { toJSON: (...args: unknown[]) => infer U }
              ? Stringified<U>
              : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-restricted-types
                T extends Map<infer _, infer _> | Set<infer _> | { toJSON: Function }
                ? object
                : T extends readonly (infer U)[]
                  ? Stringified<U extends undefined ? null : U>[]
                  : T extends object
                    ? {
                          [
                              // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-restricted-types
                              K in keyof T as T[K] extends Function | symbol
                                  ? never
                                  : Stringified<T[K]> extends never
                                    ? never
                                    : K extends symbol
                                      ? never
                                      : K
                          ]: Stringified<T[K]>
                      }
                    : never

/*@__INLINE__*/
export function objectSpreadable(json?: Json): { readonly [key: string]: Json } {
    if (!json) {
        return {}
    }
    return json as unknown as { readonly [key: string]: Json }
}

/*@__INLINE__*/
export function arraySpreadable(json?: Json): readonly Json[] {
    if (!Array.isArray(json)) {
        return []
    }
    return json as readonly Json[]
}

/*@__INLINE__*/
export function missing(what?: string): never {
    throw new Error(what ? `Missing ${what}.` : 'Missing.')
}
