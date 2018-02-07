MATCH_VERSION="[0-9]\+\(\.[0-9]\+\)\{2,\}"

usage() {
	echo "Usage: $0 [branch] [version]"
	echo
	echo "Branch defaults to 'master'."
	echo "Version defaults to what is listed in package.json in the branch."
	echo "Version should only be specified for pre-releases."
	exit 1
}

if [ "$1" == "--help" ]; then
	usage
	exit 0
elif [ "$1" == "" ]; then
	BRANCH="master"
else
	BRANCH=$1
fi

if [ "$2" != "" ]; then
	VERSION=$2
fi

ROOT_DIR=$(cd $(dirname $0) && cd .. && pwd)
BUILD_DIR="$ROOT_DIR/build"

if [ -d "$BUILD_DIR" ]; then
	echo "Existing build directory detected at $BUILD_DIR"
	echo "Aborted."
	exit 1
fi

echo "This is an internal Intern release script!"
echo -n "Press 'y' to create a new Intern Recorder release from branch $BRANCH"
if [ "$VERSION" == "" ]; then
	echo "."
else
	echo -e "\nwith version override $VERSION."
fi
echo "(You can abort pushing upstream later on if something goes wrong.)"
read -s -n 1

if [ "$REPLY" != "y" ]; then
	echo "Aborted."
	exit 0
fi

cd "$ROOT_DIR"
mkdir "$BUILD_DIR"
git clone --recursive git@github.com:theintern/recorder.git "$BUILD_DIR"

cd "$BUILD_DIR"

# Store the newly created tags and all updated branches outside of the loop so we can push/publish them all at once
# at the end instead of having to guess that the second loop will run successfully after the first one
RELEASE_TAG=
PUSH_BRANCHES="$BRANCH"

echo -e "\nBuilding $BRANCH branch...\n"

git checkout $BRANCH

# Get the version number for this release from package.json
if [ "$VERSION" == "" ]; then
	VERSION=$(grep -o '"version": "[^"]*"' package.json | grep -o "$MATCH_VERSION")

	# Convert the version number to an array that we can use to generate the next release version number
	OLDIFS=$IFS
	IFS="."
	PRE_VERSION=($VERSION)
	IFS=$OLDIFS

	# This is a new major/minor release
	if [[ $VERSION =~ \.0$ ]]; then
		# We'll be creating a new minor release branch for this version for any future patch releases
		MAKE_BRANCH="${PRE_VERSION[0]}.${PRE_VERSION[1]}"
		BRANCH_VERSION="${PRE_VERSION[0]}.${PRE_VERSION[1]}.$((PRE_VERSION[2] + 1))-pre"
		MANIFEST_BRANCH_VERSION="${PRE_VERSION[0]}.${PRE_VERSION[1]}.$((PRE_VERSION[2] + 1)).0"

		# The next release is usually going to be a minor release; if the next version is to be a major release,
		# the package version will need to be manually updated in Git before release
		MANIFEST_PRE_VERSION="${PRE_VERSION[0]}.$((PRE_VERSION[1] + 1)).0.0"
		PRE_VERSION="${PRE_VERSION[0]}.$((PRE_VERSION[1] + 1)).0-pre"

	# This is a new patch release
	else
		# Patch releases do not get a branch
		MAKE_BRANCH=
		BRANCH_VERSION=
		MANIFEST_BRANCH_VERSION=

		# The next release version will always be another patch version
		MANIFEST_PRE_VERSION="${PRE_VERSION[0]}.${PRE_VERSION[1]}.$((PRE_VERSION[2] + 1)).0"
		PRE_VERSION="${PRE_VERSION[0]}.${PRE_VERSION[1]}.$((PRE_VERSION[2] + 1))-pre"
	fi
else
	MAKE_BRANCH=
	BRANCH_VERSION=
	MANIFEST_BRANCH_VERSION=
	PRE_VERSION=$(grep -o '"version": "[^"]*"' package.json | grep -o "$MATCH_VERSION")
	PRE_VERSION="$PRE_VERSION-pre"

	MANIFEST_VERSION=$(grep -o '"version": "[^"]*"' manifest.json | grep -o "$MATCH_VERSION")

	# Convert the version number to an array that we can use to generate the next release version number
	OLDIFS=$IFS
	IFS="."
	MANIFEST_PRE_VERSION=($MANIFEST_VERSION)
	IFS=$OLDIFS

	# Manifest needs the 4th version number incremented on each pre-release. The currently committed version in
	# manifest.json is used for this release, then it is incremented immediately for the next pre-release (or final
	# release). e.g.:
	# 1.0.0-alpha.1 -> 1.0.0.0, pre is 1.0.0.1
	# 1.0.0-alpha.2 -> 1.0.0.1, pre is 1.0.0.2
	# 1.0.0 -> 1.0.0.2, pre is 1.0.1.0
	MANIFEST_PRE_VERSION="${MANIFEST_PRE_VERSION[0]}.${MANIFEST_PRE_VERSION[1]}.${MANIFEST_PRE_VERSION[2]}.$((MANIFEST_PRE_VERSION[3] + 1))"
fi

TAG_VERSION=$VERSION
RELEASE_TAG="$TAG_VERSION"

# At this point:
# $VERSION is the version of Intern that is being released;
# $TAG_VERSION is the name that will be used for the Git tag for the release
# $PRE_VERSION is the next pre-release version of Intern that will be set on the original branch after tagging
# $MAKE_BRANCH is the name of the new minor release branch that should be created (if this is not a patch release)
# $BRANCH_VERSION is the pre-release version of Intern that will be set on the minor release branch
# $MANIFEST_* are the same versions as the unprefixed ones, except using a monotonically increasing fourth version
# number instead of a semver prerelease suffix

# Something is messed up and this release has already happened
if [ $(git tag |grep -c "^$TAG_VERSION$") -gt 0 ]; then
	echo -e "\nTag $TAG_VERSION already exists! Please check the branch.\n"
	exit 1
fi

# Set the package version to release version
sed -i -e "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
sed -i -e "s/\"version_name\": \"[^\"]*\"/\"version_name\": \"$VERSION\"/" manifest.json

# Fix the Git-based dependencies to specific commit IDs
echo -e "\nFixing dependency commits...\n"
for DEP in dojo; do
	DEP_URL=$(grep -o "\"$DEP\": \"[^\"]*\"" package.json |grep -o 'https://[^"]*' |sed -e 's/\/archive.*//')
	COMMIT=$(grep -o "\"$DEP\": \"[^\"]*\"" package.json |grep -o 'https://[^"]*' |sed -e 's/.*archive\/\(.*\)\.tar\.gz/\1/')
	if [ "$DEP_URL" != "" ]; then
		if [[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]]; then
			echo -e "\nDependency $DEP is already fixed to $COMMIT\n"
		else
			mkdir "$BUILD_DIR/.dep"
			git clone --single-branch --depth 1 --branch=$COMMIT "$DEP_URL.git" "$BUILD_DIR/.dep"
			cd "$BUILD_DIR/.dep"
			COMMIT=$(git log -n 1 --format='%H')
			cd "$BUILD_DIR"
			rm -rf "$BUILD_DIR/.dep"
			DEP_URL=$(echo $DEP_URL |sed -e 's/[\/&]/\\&/g')
			echo -e "\nFixing dependency $DEP to commit $COMMIT...\n"
			sed -i -e "s/\(\"$DEP\":\) \"[^\"]*\"/\1 \"$DEP_URL\/archive\/$COMMIT.tar.gz\"/" package.json
		fi
	fi
done

# Commit the new release to Git
git commit -m "Updating metadata for $VERSION" package.json manifest.json
git tag -a -m "Release $VERSION" $TAG_VERSION

# Check out the previous package.json to get rid of the fixed dependencies
git checkout HEAD^ package.json
git reset package.json

# Set the package version to next pre-release version
sed -i -e "s/\"version\": \"[^\"]*\"/\"version\": \"$PRE_VERSION\"/" package.json
sed -i -e "s/\"version\": \"[^\"]*\"/\"version\": \"$MANIFEST_PRE_VERSION\"/" manifest.json
sed -i -e "s/\"version_name\": \"[^\"]*\"/\"version_name\": \"$PRE_VERSION\"/" manifest.json

# Commit the pre-release to Git
git commit -m "Updating source version to $PRE_VERSION" package.json manifest.json

# If this is a major/minor release, we also create a new branch for it
if [ "$MAKE_BRANCH" != "" ]; then
	# Create the new branch starting at the tagged release version
	git checkout -b $MAKE_BRANCH $TAG_VERSION

	# Set the package version to the next patch pre-release version
	sed -i -e "s/\"version\": \"[^\"]*\"/\"version\": \"$BRANCH_VERSION\"/" package.json
	sed -i -e "s/\"version\": \"[^\"]*\"/\"version\": \"$MANIFEST_BRANCH_VERSION\"/" manifest.json
	sed -i -e "s/\"version_name\": \"[^\"]*\"/\"version_name\": \"$BRANCH_VERSION\"/" manifest.json

	# Commit the pre-release to Git
	git commit -m "Updating source version to $BRANCH_VERSION" package.json manifest.json

	# Store the branch as one that needs to be pushed when we are ready to deploy the release
	PUSH_BRANCHES="$PUSH_BRANCHES $MAKE_BRANCH"
fi

echo -e "\nDone!\n"

echo "Please confirm packaging success, then press 'y', ENTER to build release archive,"
echo "push tags $RELEASE_TAG, and upload, or any other key to bail."
read -p "> "

if [ "$REPLY" != "y" ]; then
	echo "Aborted."
	exit 0
fi

for BRANCH in $PUSH_BRANCHES; do
	git push origin $BRANCH
done

git push origin --tags

git checkout $RELEASE_TAG
zip -9r $ROOT_DIR/recorder-$RELEASE_TAG.zip . -x@.zipignore

cd "$ROOT_DIR"
rm -rf "$BUILD_DIR"

echo -e "\nAll done! Yay!"
