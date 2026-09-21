import UIKit
import Capacitor
import LineSDK

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
class YumetanBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthBrowserPlugin())
        bridge?.registerPluginInstance(LineLoginPlugin())
    }
}
