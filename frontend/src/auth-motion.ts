let activeTransition: ViewTransition | undefined

export async function transitionAuth(update: () => void | Promise<void>) {
  activeTransition?.skipTransition()
  const root = document.documentElement
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    activeTransition = undefined
    root.classList.remove('auth-switching')
    await update()
    return
  }

  root.classList.add('auth-switching')
  const transition = document.startViewTransition(update)
  activeTransition = transition
  void transition.ready.catch(() => {})
  const finish = () => {
    if (activeTransition !== transition) return
    root.classList.remove('auth-switching')
    activeTransition = undefined
  }
  void transition.finished.then(finish, finish)
  await transition.updateCallbackDone
}
