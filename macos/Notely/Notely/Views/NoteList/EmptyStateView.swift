import SwiftUI

struct EmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.accent.opacity(0.08))
                    .frame(width: 64, height: 64)
                Image(systemName: icon)
                    .font(.system(size: 26, weight: .light))
                    .foregroundColor(.accent)
            }

            VStack(spacing: 6) {
                Text(title)
                    .font(.notely(15, weight: .semibold))
                    .foregroundColor(.primaryText)
                Text(subtitle)
                    .font(.notely(13))
                    .foregroundColor(.tertiaryText)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)
                    .frame(maxWidth: 220)
            }
        }
        .padding(.vertical, 32)
    }
}
