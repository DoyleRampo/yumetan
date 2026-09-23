import UIKit
import Capacitor
import LineSDK
import GoogleSignIn
import AuthenticationServices
import CryptoKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = YumetanBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // The LINE app returns the login result through the line3rdp.<bundle id> URL scheme.
        if LoginManager.shared.isSetupFinished,
           let url = URLContexts.first?.url,
           LoginManager.shared.application(UIApplication.shared, open: url) {
            return
        }
        if let url = URLContexts.first?.url, GIDSignIn.sharedInstance.handle(url) {
            return
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// Authentication runs in the system browser, outside the app WebView.
@objc(AuthBrowserPlugin)
public class AuthBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthBrowserPlugin"
    public let jsName = "AuthBrowser"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]
    @objc func open(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme == "https", url.host != nil, url.path == "/auth.html" else {
            call.reject("Invalid authentication URL"); return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Could not open browser") }
            }
        }
    }
}
// LINE login through the LINE app itself (LINE SDK). The ID token is handed to
// the JavaScript side, which exchanges it for a Firebase token on the server.
@objc(LineLoginPlugin)
public class LineLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LineLoginPlugin"
    public let jsName = "LineLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise)
    ]
    @objc func login(_ call: CAPPluginCall) {
        guard let channelId = call.getString("channelId"), !channelId.isEmpty else {
            call.reject("LINE channel ID is missing", "authNotConfigured"); return
        }
        Task { @MainActor in
            if !LoginManager.shared.isSetupFinished {
                LoginManager.shared.setup(channelID: channelId, universalLinkURL: nil)
            }
            LoginManager.shared.login(permissions: [.profile, .openID], in: self.bridge?.viewController) { result in
                switch result {
                case .success(let login):
                    guard let idToken = login.accessToken.IDTokenRaw else {
                        call.reject("LINE did not return an ID token", "authFailed"); return
                    }
                    call.resolve([
                        "idToken": idToken,
                        "nonce": login.IDTokenNonce ?? "",
                        "userId": login.userProfile?.userID ?? "",
                        "displayName": login.userProfile?.displayName ?? "",
                        "pictureUrl": login.userProfile?.pictureURL?.absoluteString ?? ""
                    ])
                case .failure(let error):
                    call.reject(error.localizedDescription,
                                error.isUserCancelled ? "auth/popup-closed-by-user" : "authFailed")
                }
            }
        }
    }
    @objc func logout(_ call: CAPPluginCall) {
        guard LoginManager.shared.isSetupFinished, LoginManager.shared.isAuthorized else {
            call.resolve(); return
        }
        LoginManager.shared.logout { _ in call.resolve() }
    }
}
// Google Sign-In through the Google SDK's in-app sheet. The ID token (and access
// token) go to the JavaScript side, which signs in to Firebase with them.
@objc(GoogleLoginPlugin)
public class GoogleLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleLoginPlugin"
    public let jsName = "GoogleLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise)
    ]
    @objc func login(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty else {
            call.reject("Google client ID is missing", "authNotConfigured"); return
        }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("No presenting view controller", "authFailed"); return
            }
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId)
            GIDSignIn.sharedInstance.signIn(withPresenting: controller) { result, error in
                if let error = error as NSError? {
                    let cancelled = error.code == GIDSignInError.canceled.rawValue
                    call.reject(error.localizedDescription, cancelled ? "auth/popup-closed-by-user" : "authFailed")
                    return
                }
                guard let user = result?.user, let idToken = user.idToken?.tokenString else {
                    call.reject("Google did not return an ID token", "authFailed"); return
                }
                call.resolve([
                    "idToken": idToken,
                    "accessToken": user.accessToken.tokenString,
                    "email": user.profile?.email ?? "",
                    "displayName": user.profile?.name ?? ""
                ])
            }
        }
    }
    @objc func logout(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve()
    }
}
// Sign in with Apple through the system sheet. The identity token and the raw
// nonce go to the JavaScript side, which signs in to Firebase with them.
@objc(AppleLoginPlugin)
public class AppleLoginPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleLoginPlugin"
    public let jsName = "AppleLogin"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise)]
    private var pending: CAPPluginCall?
    private var controller: ASAuthorizationController?
    // The raw nonce belongs to one request: the token Apple returns carries
    // SHA-256 of exactly this value, so it is kept per controller, never shared.
    private var nonces: [ObjectIdentifier: String] = [:]

    @objc func login(_ call: CAPPluginCall) {
        pending?.reject("Replaced by a newer sign-in request", "auth/cancelled-popup-request")
        pending = call
        let rawNonce = AppleLoginPlugin.randomNonce()
        let hashed = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }.joined()
        DispatchQueue.main.async {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = hashed
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.nonces[ObjectIdentifier(controller)] = rawNonce
            self.controller = controller
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let rawNonce = nonces.removeValue(forKey: ObjectIdentifier(controller)) ?? ""
        defer { pending = nil; self.controller = nil }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8), !identityToken.isEmpty else {
            pending?.reject("Apple did not return an identity token", "auth/apple-invalid-response"); return
        }
        pending?.resolve([
            "identityToken": identityToken,
            "rawNonce": rawNonce,
            "user": credential.user,
            "email": credential.email ?? "",
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? ""
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        nonces.removeValue(forKey: ObjectIdentifier(controller))
        defer { pending = nil; self.controller = nil }
        // ASAuthorizationError raw values (kept numeric so newer SDK cases still compile):
        // 1000 unknown (no iCloud account, missing entitlement, Simulator), 1001 canceled,
        // 1002 invalidResponse, 1003 notHandled, 1004 failed, 1005 notInteractive.
        let nsError = error as NSError
        let code: String
        if nsError.domain == ASAuthorizationError.errorDomain {
            switch nsError.code {
            case 1001: code = "auth/popup-closed-by-user"
            case 1000: code = "auth/apple-unknown"
            case 1002: code = "auth/apple-invalid-response"
            case 1003: code = "auth/apple-not-handled"
            case 1005: code = "auth/apple-not-interactive"
            default: code = "auth/apple-failed"
            }
        } else {
            code = "authFailed"
        }
        NSLog("Sign in with Apple failed: %@ (%ld) -> %@", nsError.domain, nsError.code, code)
        pending?.reject(error.localizedDescription, code)
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    private static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        if status != errSecSuccess { bytes = (0..<length).map { _ in UInt8.random(in: 0...255) } }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }
}
class YumetanBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthBrowserPlugin())
        bridge?.registerPluginInstance(LineLoginPlugin())
        bridge?.registerPluginInstance(AppleLoginPlugin())
        bridge?.registerPluginInstance(GoogleLoginPlugin())
    }
}
