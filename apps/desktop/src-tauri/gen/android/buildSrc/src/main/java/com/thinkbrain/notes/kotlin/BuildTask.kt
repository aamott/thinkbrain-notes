import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val attempts = mutableListOf<Pair<String, List<String>>>()
        attempts.add("pnpm" to emptyList())

        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
            attempts.add("pnpm.exe" to emptyList())
            attempts.add("pnpm.cmd" to emptyList())
            attempts.add("pnpm.bat" to emptyList())
        }

        attempts.add("npx" to listOf("pnpm"))
        attempts.add("corepack" to listOf("pnpm"))

        var lastException: Exception? = null
        for ((executable, prependArgs) in attempts) {
            try {
                runTauriCli(executable, prependArgs)
                return
            } catch (e: Exception) {
                lastException = e
            }
        }
        throw lastException ?: GradleException("Failed to run tauri cli")
    }

    fun runTauriCli(executable: String, prependArgs: List<String> = emptyList()) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val baseArgs = listOf("tauri", "android", "android-studio-script");
        val args = prependArgs + baseArgs

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}