import SwiftUI

/// Empty state placeholder for the note list.
struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .light))
                .foregroundColor(.secondaryText.opacity(0.5))

            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primaryText)

            Text(subtitle)
                .font(.system(size: 12))
                .foregroundColor(.secondaryText)
                .multilineTextAlignment(.center)
        }
    }
}
