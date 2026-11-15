import { User } from '../../models/User.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import logger from '@overleaf/logger'

let cachedDefaultUser = null

async function getDefaultUser() {
  if (cachedDefaultUser) {
    return cachedDefaultUser
  }
  let user = await User.findOne({})
  if (!user) {
    user = await ensureDefaultUser()
  } else if (!user.analyticsId) {
    user.analyticsId = 'desktop-analytics-id'
    await user.save()
  }
  cachedDefaultUser = user
  return user
}

async function ensureDefaultUser() {
  let user = await User.findOne({})
  if (user) {
    if (!user.analyticsId) {
      user.analyticsId = 'desktop-analytics-id'
      await user.save()
    }
    cachedDefaultUser = user
    return user
  }

  logger.info('Creating local desktop standalone user in MongoDB...')
  const defaultUser = new User({
    email: 'user@localhost',
    first_name: 'Desktop',
    last_name: 'User',
    isAdmin: true,
    staffAccess: true,
    must_reconfirm: false,
    analyticsId: 'desktop-analytics-id',
    emails: [
      {
        email: 'user@localhost',
        reversedHostname: 'tsohlacol',
        confirmedAt: new Date(),
        createdAt: new Date(),
      },
    ],
    ace: {
      mode: 'none',
      theme: 'textmate',
      fontSize: 12,
      autoComplete: true,
      autoPairDelimiters: true,
      spellCheckLanguage: 'en',
      pdfViewer: 'pdfjs',
      syntaxValidation: true,
      mathPreview: true,
      editorTabs: true,
    },
    signUpDate: new Date(),
  })

  await defaultUser.save()
  cachedDefaultUser = defaultUser
  logger.info({ userId: defaultUser._id }, 'Created local desktop user')
  return defaultUser
}

function autoLoginMiddleware(req, res, next) {
  const path = req.path || ''

  // Always allow static files, websockets, healthchecks
  if (
    path.startsWith('/stylesheets/') ||
    path.startsWith('/js/') ||
    path.startsWith('/img/') ||
    path.startsWith('/fonts/') ||
    path.startsWith('/socket.io/') ||
    path === '/health_check' ||
    path === '/status' ||
    path.startsWith('/favicon')
  ) {
    return next()
  }

  // Redirect unwanted admin / user / auth pages directly to /project
  if (
    path === '/' ||
    path === '/login' ||
    path === '/launchpad' ||
    path === '/register' ||
    path === '/logout' ||
    path.startsWith('/admin') ||
    path.startsWith('/user/settings') ||
    path.startsWith('/user/subscription')
  ) {
    if (SessionManager.isUserLoggedIn(req.session)) {
      return res.redirect('/project')
    }
  }

  if (SessionManager.isUserLoggedIn(req.session)) {
    return next()
  }

  // Single-user offline mode: silently authenticate session as default desktop user
  getDefaultUser()
    .then(user => {
      req.login(user, { keepSessionInfo: true }, err => {
        if (err) {
          logger.err({ err }, 'auto-login failed')
          return next(err)
        }
        req.session.save(() => {
          if (
            path === '/' ||
            path === '/login' ||
            path === '/launchpad' ||
            path === '/register' ||
            path === '/logout' ||
            path.startsWith('/admin') ||
            path.startsWith('/user/settings')
          ) {
            return res.redirect('/project')
          }
          next()
        })
      })
    })
    .catch(err => {
      logger.err({ err }, 'getDefaultUser error')
      next(err)
    })
}

export default {
  getDefaultUser,
  ensureDefaultUser,
  autoLoginMiddleware,
}
